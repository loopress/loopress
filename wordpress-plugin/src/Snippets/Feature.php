<?php

declare(strict_types=1);

namespace Loopress\Snippets;

use Loopress\Contract\Module;
use Loopress\Snippets\Module\SnippetModule;

/**
 * Entry point of the snippet sync feature (Code Snippets / WPCode). Everything under
 * src/Snippets/ ships only in the Loopress Full edition (see scripts/build-flavor.cjs); the
 * plugin entry file calls this inside its build markers, so the Loopress Light artifact
 * never references this namespace. wordpress.org rejected Loopress Light over this exact
 * capability (remote deployment of arbitrary PHP/JS/CSS into Code Snippets or WPCode), so
 * Light must never carry it, even inactive.
 */
class Feature
{
    /** @return Module[] */
    public static function bootstrap(): array
    {
        return [new SnippetModule()];
    }
}
