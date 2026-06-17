<?php

namespace Loopress\Infrastructure;

use Composer\Console\Application;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\BufferedOutput;

class ComposerRunner
{
    public function __construct(private LoopressEnvironment $dxEnv) {}

    /**
     * @param string[] $args
     * @param array<string, mixed> $extraOptions
     * @return array{exit_code: int, output: string}
     */
    public function run(array $args, array $extraOptions = []): array
    {
        // Composer needs HOME and COMPOSER_HOME; web processes often have neither.
        putenv('HOME=' . sys_get_temp_dir());
        putenv('COMPOSER_HOME=' . sys_get_temp_dir() . '/.composer-loopress');

        // Composer installs can take well over the default 30 s execution limit.
        // set_time_limit may be disabled on some hosts; skip silently in that case.
        if (!str_contains((string) ini_get('disable_functions'), 'set_time_limit')) {
            set_time_limit(300);
        }

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
    }
}
