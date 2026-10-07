<?php

declare(strict_types=1);

namespace Loopress\Hooks\Attribute;

/**
 * Marks a hooks/ file's method as a WP action callback, bound with add_action() exactly as
 * the developer's own $hook/$priority/$acceptedArgs describe. See HookLoader::hookMethodsFor()
 * for how a class's attributed methods are discovered and HookLoader::registerHook() for how
 * they're bound.
 */
#[\Attribute(\Attribute::TARGET_METHOD)]
final readonly class Action
{
    public function __construct(
        public string $hook,
        public int $priority = 10,
        public int $acceptedArgs = 1,
    ) {}
}
