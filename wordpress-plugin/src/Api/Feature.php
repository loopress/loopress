<?php

declare(strict_types=1);

namespace Loopress\Api;

use Loopress\Api\Module\ApiModule;
use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;

use function DI\autowire;

/**
 * Entry point of the custom API routes feature: a versioned api/ folder (`lps api push`)
 * deploys PHP files straight to wp-content/loopress/api/, each exposing a WP REST route
 * under loopress-api/v1. Everything under src/Api/ ships only in the Loopress Full edition
 * (see scripts/build-flavor.cjs); the plugin entry file calls this inside its build markers,
 * so the Loopress Light artifact never references this namespace. Same rejection precedent
 * as Snippets: wordpress.org rejects any mechanism that facilitates remote deployment of
 * arbitrary executable code, regardless of the manage_options gate in front of it.
 */
class Feature implements FeatureProvider
{
    /** @return array<string, mixed> */
    public static function definitions(): array
    {
        return [
            ApiModule::class => autowire(),
        ];
    }

    /** @return array<int, class-string<Module>> */
    public static function moduleClasses(): array
    {
        return [ApiModule::class];
    }
}
