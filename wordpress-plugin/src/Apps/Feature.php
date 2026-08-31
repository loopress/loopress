<?php

declare(strict_types=1);

namespace Loopress\Apps;

use Loopress\Apps\Module\AppsModule;
use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;

use function DI\autowire;

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
    /** @return array<string, mixed> */
    public static function definitions(): array
    {
        return [
            AppsModule::class => autowire(),
        ];
    }

    /** @return array<int, class-string<Module>> */
    public static function moduleClasses(): array
    {
        return [AppsModule::class];
    }
}
