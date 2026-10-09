<?php

declare(strict_types=1);

namespace Loopress\TempAdmin;

use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;
use Loopress\TempAdmin\Module\TempAdminModule;

/**
 * Cleans up the temporary administrator `lps project config` creates to install Loopress
 * Full (cli/src/lib/temp-admin.ts). The CLI deletes it itself, but a killed process or a
 * network drop during that delete leaves a live administrator nobody holds the password for.
 * Full-only like every other Plus feature (see scripts/build-flavor.cjs): only Full is ever
 * installed that way, and Light has no business deleting users.
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
        return [TempAdminModule::class];
    }
}
