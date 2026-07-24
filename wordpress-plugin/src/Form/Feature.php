<?php

declare(strict_types=1);

namespace Loopress\Form;

use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;
use Loopress\Form\Infrastructure\WPFormsProvider;
use Loopress\Form\Module\FormModule;
use Loopress\Form\Service\FormService;
use Psr\Container\ContainerInterface;

use function DI\factory;

/**
 * Entry point of the generic form-sync feature. Ships only in the Loopress Full edition (see
 * scripts/build-flavor.cjs); the plugin entry file calls this inside its build markers, so
 * the Loopress Light artifact never references this namespace. Light is locked to ACF+SEO
 * only (see obsidian/Product/WordPress.org Plugin Distribution.md), so any new integration
 * added after that decision lands in Full by default.
 *
 * Only one FormProvider exists today (WPFormsProvider), but the concept is deliberately
 * generic from the start, same shape as Snippets (Code Snippets/WPCode): more WordPress form
 * plugins are expected to be added as additional providers here later.
 */
class Feature implements FeatureProvider
{
    /** @return array<string, mixed> */
    public static function definitions(): array
    {
        return [
            // FormService takes a variadic list of providers: autowiring can't guess how many
            // to pass, so the currently-supported provider is wired explicitly here, same
            // pattern as Snippets/Feature.php's SnippetService wiring.
            FormService::class => factory(static fn(ContainerInterface $c): FormService => new FormService(
                $c->get(WPFormsProvider::class),
            )),
        ];
    }

    /** @return array<int, class-string<Module>> */
    public static function moduleClasses(): array
    {
        return [FormModule::class];
    }
}
