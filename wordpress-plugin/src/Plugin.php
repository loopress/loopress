<?php

namespace Loopress;

use Loopress\Contract\Module;
use Loopress\Module\AcfModule;
use Loopress\Module\AdminPageModule;
use Loopress\Module\RankMathModule;
use Loopress\Module\RestCacheModule;
use Loopress\Module\SnippetModule;
use Loopress\Module\YoastModule;

class Plugin
{
    public function __construct()
    {
        /** @var Module[] $modules */
        $modules = apply_filters('loopress_modules', [
            new AdminPageModule(),
            new SnippetModule(),
            new AcfModule(),
            new RankMathModule(),
            new YoastModule(),
            new RestCacheModule(),
        ]);

        foreach ($modules as $module) {
            $module->boot();
        }
    }
}
