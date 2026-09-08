<?php

declare(strict_types=1);

namespace Loopress\Hooks\Module;

use Loopress\Contract\Module;
use Loopress\Hooks\RestApi\HookFilesController;
use Loopress\Hooks\RestApi\HookLoader;

class HooksModule implements Module
{
    public function __construct(
        private HookFilesController $controller,
        private HookLoader $hookLoader,
    ) {}

    public function boot(): void
    {
        // The management endpoint (hook-files) is a REST route like any other, only ever
        // called by `lps hook push`/`pull`/`list`, so it registers on 'rest_api_init' same as
        // ApiFilesController. loadAndRegister() itself binds real add_action()/add_filter()
        // calls straight from here instead: those have to be in place before whatever WP event
        // they target actually fires, and 'rest_api_init' never runs on a plain page load or a
        // wp-cron.php pseudo-request. Plugin::__construct() itself already runs on
        // 'plugins_loaded' at priority 1 (see loopress.php), early enough for virtually every
        // WP hook except 'plugins_loaded' at priority <= 1 or something earlier still
        // ('muplugins_loaded'): an ordinary plugin limitation, not something hooks/ can lift.
        add_action('rest_api_init', function () {
            $this->controller->register_routes();
        });

        $this->hookLoader->loadAndRegister();
    }
}
