<?php

declare(strict_types=1);

namespace Loopress\Update;

use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;
use Loopress\Update\Module\UpdateCheckModule;

/**
 * Entry point of the update notification feature. Everything under src/Update/ ships only
 * in the Loopress Full edition (see scripts/build-flavor.cjs); the plugin entry file calls
 * this inside its build markers, so the Loopress Light artifact never references this
 * namespace. Loopress Light must never carry an update-checking mechanism of its own, even
 * inactive: wordpress.org guidelines reserve that role for their own SVN-based update flow.
 */
class Feature implements FeatureProvider
{
    /** @return array<string, mixed> */
    public static function definitions(): array
    {
        // UpdateCheckModule and its GithubReleaseChecker dependency are both fully
        // autowirable (no ambiguous or scalar constructor parameters), so no explicit
        // wiring is needed here.
        return [];
    }

    /** @return array<int, class-string<Module>> */
    public static function moduleClasses(): array
    {
        return [UpdateCheckModule::class];
    }
}
