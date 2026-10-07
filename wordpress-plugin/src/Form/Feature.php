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
 * Entry point of the generic form-sync feature. Ships in both editions: Plugin.php wires it
 * directly, outside loopress.php's Full-only build markers. A form is JSON configuration, the
 * same kind of data as ACF and SEO, and every pushed string goes through SyncSanitizer (see
 * WPFormsProvider::sanitizeFormData()), so it carries no executable code into Loopress Light.
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
