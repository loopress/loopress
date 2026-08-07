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
    ) {}
}
