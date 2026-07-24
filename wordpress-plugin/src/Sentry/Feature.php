<?php

declare(strict_types=1);

namespace Loopress\Sentry;

use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;
use Loopress\Sentry\Module\SentryModule;

/**
 * Entry point of the error-monitoring feature. Everything under src/Sentry/ ships only in
 * the Loopress Full edition (see scripts/build-flavor.cjs); the plugin entry file calls this
 * inside its build markers, so the Loopress Light artifact never references this namespace.
 */
class Feature implements FeatureProvider
{
    /** @return array<string, mixed> */
    public static function definitions(): array
    {
        return [];
    }

    /** @return array<int, class-string<Module>> */
    public static function moduleClasses(): array
    {
        return [SentryModule::class];
    }
}
