<?php

namespace Loopress\Infrastructure;

use Composer\Console\Application;
use Loopress\Exception\ConcurrentOperationException;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\BufferedOutput;

class ComposerRunner
{
    private const LOCK_FILE = '.loopress.lock';

    public function __construct(private LoopressEnvironment $dxEnv) {}

    /**
     * @param string[] $args
     * @param array<string, mixed> $extraOptions
     * @return array{exit_code: int, output: string}
     */
    public function run(array $args, array $extraOptions = []): array
    {
        $this->dxEnv->ensureInitialized();

        // Serialize Composer runs: two concurrent install/require/update operations on the
        // same working directory corrupt vendor/ and composer.lock.
        $lockHandle = $this->acquireLock();

        // Composer needs HOME and COMPOSER_HOME; web processes often have neither.
        // Save the previous values so a reused PHP worker isn't left with a modified env.
        $previousHome         = getenv('HOME');
        $previousComposerHome = getenv('COMPOSER_HOME');
        // Composer's Application reads these via getenv() internally; there's no WP-native way
        // to configure a third-party library's environment, and the previous values are restored below.
        putenv('HOME=' . sys_get_temp_dir()); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.runtime_configuration_putenv
        putenv('COMPOSER_HOME=' . sys_get_temp_dir() . '/.composer-loopress'); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.runtime_configuration_putenv

        // Composer installs can take well over the default 30 s execution limit.
        // set_time_limit may be disabled on some hosts; skip silently in that case.
        if (!str_contains((string) ini_get('disable_functions'), 'set_time_limit')) {
            set_time_limit(300);
        }

        try {
            $command  = array_shift($args);
            $inputDef = ['command' => $command];

            // require/remove pass package names; update passes none.
            if (!empty($args)) {
                $inputDef['packages'] = $args;
            }

            $inputDef['--working-dir']    = $this->dxEnv->getDxDir();
            $inputDef['--no-interaction'] = true;
            $inputDef['--no-ansi']        = true;

            foreach ($extraOptions as $key => $value) {
                $inputDef[$key] = $value;
            }

            $output = new BufferedOutput();
            $app    = new Application();
            $app->setAutoExit(false);

            $exitCode = $app->run(new ArrayInput($inputDef), $output);

            return ['exit_code' => $exitCode, 'output' => trim($output->fetch())];
        } finally {
            putenv($previousHome === false ? 'HOME' : "HOME={$previousHome}"); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.runtime_configuration_putenv
            putenv($previousComposerHome === false ? 'COMPOSER_HOME' : "COMPOSER_HOME={$previousComposerHome}"); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.runtime_configuration_putenv
            flock($lockHandle, LOCK_UN);
            fclose($lockHandle); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
        }
    }

    /** @return resource */
    private function acquireLock()
    {
        $lockPath   = $this->dxEnv->getDxDir() . self::LOCK_FILE;
        $lockHandle = fopen($lockPath, 'c'); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen

        if ($lockHandle === false) {
            throw new \RuntimeException("Failed to open lock file {$lockPath}");
        }

        if (!flock($lockHandle, LOCK_EX | LOCK_NB)) {
            fclose($lockHandle); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
            throw new ConcurrentOperationException(
                'Another Composer operation is already running on this site. Retry in a moment.'
            );
        }

        return $lockHandle;
    }
}
