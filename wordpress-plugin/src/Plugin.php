<?php

declare(strict_types=1);

namespace Loopress;

use Loopress\Acf\Module\AcfModule;
use Loopress\AdminPage\Module\AdminPageModule;
use Loopress\Capabilities\Module\CapabilitiesModule;
use Loopress\Content\Module\ContentModule;
use Loopress\Contract\Module;
use Loopress\Form\Infrastructure\WPFormsProvider;
use Loopress\Form\Module\FormModule;
use Loopress\Form\Service\FormService;
use Loopress\Menu\Module\MenuModule;
use Loopress\Options\Module\OptionsModule;
use Loopress\PostTypes\Module\PostTypesModule;
use Loopress\Pushes\Module\PushesModule;
use Loopress\RestCache\Module\RestCacheModule;
use Loopress\Themes\Module\ThemesModule;

use function DI\factory;

final class Plugin
{
    public function __construct()
    {
        /** @var array<string, mixed> $definitions */
        $definitions = apply_filters('loopress_feature_definitions', [
            // FormService takes a variadic list of providers, which autowiring can't guess:
            // one per supported form plugin, WPForms only today.
            FormService::class => factory(static fn(WPFormsProvider $wpForms): FormService => new FormService($wpForms)),
        ]);
        $container   = ContainerFactory::create($definitions);

        /** @var array<int, class-string<Module>> $moduleClasses */
        $moduleClasses = apply_filters('loopress_module_classes', [
            AdminPageModule::class,
            AcfModule::class,
            OptionsModule::class,
            MenuModule::class,
            PostTypesModule::class,
            RestCacheModule::class,
            FormModule::class,
            PushesModule::class,
            ContentModule::class,
            CapabilitiesModule::class,
            ThemesModule::class,
        ]);

        foreach ($moduleClasses as $moduleClass) {
            /** @var Module $module */
            $module = $container->get($moduleClass);
            $module->boot();
        }
    }
}
