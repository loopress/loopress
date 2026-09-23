<?php

declare(strict_types=1);

namespace Loopress\Pages;

use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;
use Loopress\Pages\Module\PagesModule;

/**
 * Entry point of the static pages feature (`lps page push`): a versioned pages/ folder of
 * hand-written HTML, one WordPress page per file, stored in a post meta and rendered through
 * the_content (see PageFilters). Full-only (see scripts/build-flavor.cjs): pushed HTML can
 * carry <script>, close enough to the "remote deployment of arbitrary content" wordpress.org
 * rejected Snippets and Api over to keep it out of Loopress Light.
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
        return [PagesModule::class];
    }
}
