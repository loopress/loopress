<?php

declare(strict_types=1);

namespace Loopress;

use Loopress\Acf\Module\AcfModule;
use Loopress\AdminPage\Module\AdminPageModule;
use Loopress\Contract\Module;
use Loopress\RestCache\Module\RestCacheModule;
use Loopress\Seo\Module\SeoModule;

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
