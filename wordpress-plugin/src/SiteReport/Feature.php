<?php

declare(strict_types=1);

namespace Loopress\SiteReport;

use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;
use Loopress\SiteReport\Module\SiteReportModule;

/**
 * Entry point of the site reports feature: with a site token pasted in the Settings tab, the
 * site sends its versions, installed plugins, pending updates and Site Health counts to the
 * Loopress console twice a day. Full-only (see scripts/build-flavor.cjs): Loopress Light must
 * never phone home.
 */
final class Feature implements FeatureProvider
{
    /** @return array<string, mixed> */
    public static function definitions(): array
    {
        return [];
    }

    /** @return array<int, class-string<Module>> */
    public static function moduleClasses(): array
    {
        return [SiteReportModule::class];
    }
}
