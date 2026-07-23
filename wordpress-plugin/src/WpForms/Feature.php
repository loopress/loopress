<?php

declare(strict_types=1);

namespace Loopress\WpForms;

use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;
use Loopress\WpForms\Module\WpFormsModule;

/**
 * Entry point of the WPForms sync feature. Ships only in the Loopress Full edition (see
 * scripts/build-flavor.cjs); the plugin entry file calls this inside its build markers, so
 * the Loopress Light artifact never references this namespace. Light is locked to ACF+SEO
 * only (see obsidian/Product/WordPress.org Plugin Distribution.md), so any new integration
 * added after that decision lands in Full by default.
 */
class Feature implements FeatureProvider
{
    // WpFormsModule has no constructor dependencies of its own (it builds its WpFormsService
    // directly, same as AcfModule), so there is nothing to wire here, unlike Snippets whose
    // multi-provider constructor needs explicit factories.
    /** @return array<string, mixed> */
    public static function definitions(): array
    {
        return [];
    }

    /** @return array<int, class-string<Module>> */
    public static function moduleClasses(): array
    {
        return [WpFormsModule::class];
    }
}
