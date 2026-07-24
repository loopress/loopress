<?php

declare(strict_types=1);

namespace Loopress\Settings;

use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;
use Loopress\Settings\Module\SettingsModule;

/**
 * Entry point of the "reset all Loopress settings" feature: one button in the frontend
 * Settings tab, not scoped to any single feature's own option, so it lives in its own
 * namespace rather than under whichever feature happens to own a resettable option today
 * (currently just Sentry\Consent). Full-only like every other Plus feature (see
 * scripts/build-flavor.cjs), because the Settings tab itself only exists in Loopress Full.
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
        return [SettingsModule::class];
    }
}
