<?php

declare(strict_types=1);

namespace Loopress\Api\Attribute;

/**
 * Declares a route file's permission_callback on the class (default for every verb) or on a
 * specific verb method (overrides the class-level one, or the default, for that verb only).
 * See RouteLoader::resolvePermission() for the resolution order.
 */
#[\Attribute(\Attribute::TARGET_CLASS | \Attribute::TARGET_METHOD)]
final class Permission
{
    /**
     * @param string|array{0: class-string, 1: string}|null $callback A local method name on
     *   the route's own class, or [SomeClass::class, 'staticMethod'] for a shared, stateless
     *   check. Either way the referenced method must accept a WP_REST_Request and return bool.
     */
    public function __construct(
        public readonly bool $public = false, // phpcs:ignore Universal.NamingConventions.NoReservedKeywordParameterNames.publicFound -- #[Permission(public: true)] is the intended, decided call-site syntax
        public readonly ?string $capability = null,
        public readonly string|array|null $callback = null,
    ) {
        // RouteLoader::permissionFromAttribute() checks public, then callback, then capability,
        // in that order: combining more than one would silently pick whichever it checks
        // first rather than error, exactly the kind of ambiguous-input footgun this file's
        // sibling classes (permission(), FileWriter's declare check) already fail loudly on
        // instead of guessing. Caught by RouteLoader::loadFile()'s existing try/catch, same
        // "skip this route, log it, never fatal the site" handling as any other malformed file.
        $optionsSet = ($this->public ? 1 : 0) + ($this->capability !== null ? 1 : 0) + ($this->callback !== null ? 1 : 0);
        if ($optionsSet > 1) {
            throw new \InvalidArgumentException('#[Permission] accepts only one of public, capability, or callback.');
        }
    }
}
