<?php

declare(strict_types=1);

namespace Loopress\Dependencies\Infrastructure;

use Composer\Console\Application;
use Loopress\Dependencies\Exception\ConcurrentOperationException;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\BufferedOutput;

class ComposerRunner
{
    private const LOCK_FILE = '.loopress.lock';

    public function __construct(private LoopressEnvironment $environment) {}

    /**
     * @param string[] $args
     * @param array<string, mixed> $extraOptions
     * @return array{exit_code: int, output: string}
     */
    public function run(array $args, array $extraOptions = []): array
    {
        $this->environment->ensureInitialized();

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
            set_time_limit(300); // phpcs:ignore Squiz.PHP.DiscouragedFunctions.Discouraged
        }

        try {
            $this->registerInstallersAutoloader();

            $inputDef = $this->buildInputDef($args, $extraOptions);

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

    /**
     * Build the ArrayInput definition for a Composer command. Split out from run() so the fixed
     * hardening flags below are unit-testable without spinning up a real Composer\Application.
     *
     * @param string[] $args first element is the command, the rest are package arguments
     * @param array<string, mixed> $extraOptions
     * @return array<string, mixed>
     */
    private function buildInputDef(array $args, array $extraOptions): array
    {
        $args     = array_values($args);
        $command  = array_shift($args);
        $inputDef = ['command' => $command];

        // require/remove pass package names; update passes none.
        if (!empty($args)) {
            $inputDef['packages'] = $args;
        }

        $inputDef['--working-dir']    = $this->environment->getLoopressDir();
        $inputDef['--no-interaction'] = true;
        $inputDef['--no-ansi']        = true;
        // Never run Composer scripts or event handlers. A dependency's post-install / post-update
        // hook, or a transitive composer-plugin, must not get code execution on the server just
        // because a package was installed. The plugin's own composer.json defines no scripts;
        // this is defence in depth for the sync / require paths (F17, F22).
        $inputDef['--no-scripts']     = true;

        foreach ($extraOptions as $key => $value) {
            $inputDef[$key] = $value;
        }

        return $inputDef;
    }

    private static bool $installersAutoloaderRegistered = false;

    // Composer's Application runs in-process, sharing WordPress's PHP autoload stack with
    // every other active plugin. A wordpress-plugin-type package (any package a site's
    // composer.json requires via wpackagist-plugin/*, e.g. to install a WordPress.org plugin
    // from Composer) needs composer/installers active as a Composer plugin to land in
    // wp-content/plugins/ instead of vendor/. Observed in the wild: Yoast SEO ships its own
    // vendor/composer/autoload_classmap.php with full entries for every Composer\Installers\*
    // class, pointing at files that don't exist in Yoast's own vendor (stale from Yoast's own
    // build, unrelated to Loopress). Composer's plugin manager autoloads Composer\Installers\*
    // through PHP's global, shared autoload chain right after extracting the package to disk,
    // so if Yoast's autoloader is registered first (registration order, not ours to control)
    // and answers first, its include() on the missing path fatals the whole request before any
    // other autoloader, including a correct one, gets a turn.
    //
    // Prepending our own autoloader ahead of every other one guarantees ours answers for these
    // classes first, straight from our own known-good copy. It resolves lazily (looks the file
    // up only when a class is actually requested) rather than requiring every file up front,
    // because this also has to work the very first time composer/installers is installed on a
    // site: its files land on disk mid-run, during this same command, before Composer needs to
    // activate it as a plugin, so nothing is on disk yet when run() starts.
    private function registerInstallersAutoloader(): void
    {
        if (self::$installersAutoloaderRegistered) {
            return;
        }
        self::$installersAutoloaderRegistered = true;

        $installersDir = rtrim($this->environment->getLoopressDir(), '/') . '/vendor/composer/installers/src/Composer/Installers/';

        spl_autoload_register(static function (string $class) use ($installersDir): void {
            if (!str_starts_with($class, 'Composer\\Installers\\')) {
                return;
            }

            $file = $installersDir . str_replace('\\', '/', substr($class, strlen('Composer\\Installers\\'))) . '.php';
            if (is_file($file)) {
                require_once $file;
            }
        }, true, true);
    }

    /** @return resource */
    private function acquireLock()
    {
        $lockPath   = $this->environment->getLoopressDir() . self::LOCK_FILE;
        $lockHandle = fopen($lockPath, 'c'); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen

        if ($lockHandle === false) {
            throw new \RuntimeException(esc_html("Failed to open lock file {$lockPath}"));
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
