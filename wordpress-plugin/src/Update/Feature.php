<?php

namespace Loopress\Update;

use Loopress\Contract\Module;
use Loopress\Update\Infrastructure\GithubReleaseChecker;
use Loopress\Update\Module\UpdateCheckModule;

/**
 * Entry point of the update notification feature. Everything under src/Update/ ships only
 * in the Loopress Full edition (see scripts/build-flavor.cjs); the plugin entry file calls
 * this inside its build markers, so the Loopress Light artifact never references this
 * namespace. Loopress Light must never carry an update-checking mechanism of its own, even
 * inactive: wordpress.org guidelines reserve that role for their own SVN-based update flow.
 */
class Feature
{
    /** @return Module[] */
    public static function bootstrap(): array
    {
        return [new UpdateCheckModule(new GithubReleaseChecker())];
    }
}
