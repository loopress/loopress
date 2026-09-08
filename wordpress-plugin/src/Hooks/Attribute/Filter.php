<?php

declare(strict_types=1);

namespace Loopress\Hooks\Attribute;

/**
 * Marks a hooks/ file's method as a WP filter callback, bound with add_filter(). Same shape
 * as #[Action], the two are only kept separate (rather than one attribute with a $type flag)
 * because add_action()/add_filter() are themselves separate WP entry points and a filter
 * method is expected to return a value where an action method isn't, worth stating in the
 * declaration itself rather than only in behavior.
 */
#[\Attribute(\Attribute::TARGET_METHOD)]
final class Filter
{
    public function __construct(
        public readonly string $hook,
        public readonly int $priority = 10,
        public readonly int $acceptedArgs = 1,
    ) {}
}
