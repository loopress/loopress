<?php

declare(strict_types=1);

namespace Loopress\Apps;

use Loopress\Apps\Module\AppsModule;
use Loopress\Apps\Service\AppsDiagnostics;
use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;
use Loopress\Infrastructure\WpHttpClient;

use function DI\autowire;
use function DI\factory;
use function DI\get;

/**
 * Entry point of the single-page-app hosting feature: a versioned apps/ folder
 * (`lps app push`) ships a pre-built SPA bundle (`dist/`) straight to
 * wp-content/loopress/apps/<name>/, and the `[loopress_app name="..."]` shortcode mounts it
 * into any page by enqueuing its content-hashed entry files.
 *
 * Loopress never builds the app: it syncs a static bundle and a mount helper, nothing more.
 *
 * Everything under src/Apps/ ships only in the Loopress Full edition (see
 * scripts/build-flavor.cjs); the plugin entry file calls this inside its build markers, so
 * the Loopress Light artifact never references this namespace. Same rejection precedent as
 * Snippets and Api: wordpress.org rejects any mechanism that facilitates remote deployment
 * of code that runs on the site (a bundled SPA executes in every visitor's browser on the
 * site's own origin), regardless of the manage_options gate in front of it.
 */
class Feature implements FeatureProvider
{
    private const HTTP_CLIENT = 'loopress.apps.http_client';

    /** @return array<string, mixed> */
    public static function definitions(): array
    {
        return [
            AppsModule::class => autowire(),

            // AppsDiagnostics takes a bare ClientInterface, which PHP-DI can't autowire on its
            // own (it's an interface); give it a WpHttpClient, same as Dependencies\Feature does
            // for its own probe. Short timeout: this is a same-origin liveness check, not a fetch.
            self::HTTP_CLIENT => factory(static fn(): WpHttpClient => new WpHttpClient(10)),
            AppsDiagnostics::class => autowire()->constructorParameter('httpClient', get(self::HTTP_CLIENT)),
        ];
    }

    /** @return array<int, class-string<Module>> */
    public static function moduleClasses(): array
    {
        return [AppsModule::class];
    }
}
