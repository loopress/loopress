<?php

namespace Loopress;

use Loopress\Contract\Module;
use Loopress\Module\AcfModule;
use Loopress\Module\AdminPageModule;
use Loopress\Module\RestCacheModule;
use Loopress\Module\SeoModule;
use Loopress\Module\SnippetModule;

class Plugin
{
    public function __construct()
    {
        /** @var Module[] $modules */
        $modules = apply_filters('loopress_modules', [
            new AdminPageModule(),
            new SnippetModule(),
            new AcfModule(),
            new SeoModule(),
            new RestCacheModule(),
        ]);

        foreach ($modules as $module) {
            $module->boot();
        }
    }
}
