<?php

namespace Loopress;

use Loopress\Contract\Module;
use Loopress\Infrastructure\LoopressEnvironment;
use Loopress\Module\AdminPageModule;
use Loopress\Module\RestCacheModule;
use Loopress\Module\ComposerModule;
use Loopress\Module\SnippetModule;

class Plugin
{
    public function __construct()
    {
        $env = new LoopressEnvironment();

        $autoloadError = null;
        $autoload      = $env->getAutoloadPath();
        if ($autoload) {
            // A broken vendor/ can surface as any Throwable (\Error for missing files,
            // E_USER_ERROR from Composer's platform check, ...): catch everything so the
            // admin UI can offer the auto-repair flow instead of white-screening the site.
            try {
                ob_start();
                require_once $autoload;
                ob_end_clean();
            } catch (\Throwable $e) {
                ob_end_clean();
                $autoloadError = $e->getMessage();
            }
        }

        /** @var Module[] $modules */
        $modules = apply_filters('loopress_modules', [
            new AdminPageModule($autoloadError),
            new ComposerModule($env),
            new SnippetModule(),
            new RestCacheModule(),
        ]);

        foreach ($modules as $module) {
            $module->boot();
        }
    }
}
