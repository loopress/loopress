<?php

declare(strict_types=1);

namespace Loopress;

use Loopress\Contract\Module;
use Loopress\Module\AcfModule;
use Loopress\Module\AdminPageModule;
use Loopress\Module\RestCacheModule;
use Loopress\Module\SeoModule;

class Plugin
{
    public function __construct()
    {
        /** @var array<string, mixed> $definitions */
        $definitions = apply_filters('loopress_feature_definitions', []);
        $container   = ContainerFactory::create($definitions);

        /** @var array<int, class-string<Module>> $moduleClasses */
        $moduleClasses = apply_filters('loopress_module_classes', [
            AdminPageModule::class,
            AcfModule::class,
            SeoModule::class,
            RestCacheModule::class,
        ]);

        foreach ($moduleClasses as $moduleClass) {
            /** @var Module $module */
            $module = $container->get($moduleClass);
            $module->boot();
        }
    }
}
