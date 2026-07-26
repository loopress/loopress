<?php

declare(strict_types=1);

namespace Loopress\Api;

/**
 * Single source of truth for the developer-facing REST namespace (default loopress-api/v1,
 * where a pushed api/hello.php becomes loopress-api/v1/hello), shared between RouteLoader's
 * boot-time registration and ApiNamespaceController's REST reads/writes. Distinct from
 * loopress/v1, the fixed namespace every Loopress-owned management endpoint uses (api-files,
 * sentry/consent, settings...): that one is never configurable, only the namespace a
 * developer's own routes register under is.
 */
final class ApiNamespace
{
    public const OPTION = 'loopress_api_namespace';
    public const DEFAULT = 'loopress-api/v1';

    // Reserved for Loopress's own management endpoints; pointing developer routes here would
    // silently collide with api-files/sentry/settings.
    private const RESERVED = 'loopress/v1';

    private const PATTERN = '/^[a-z][a-z0-9-]*\/v[0-9]+$/';

    /** @return non-falsy-string */
    public static function current(): string
    {
        $value = get_option(self::OPTION, self::DEFAULT);

        // A malformed stored value (only reachable via a direct DB edit, update_namespace()
        // already validates) must never break every route at boot: fall back to the closed
        // default rather than register_rest_route() with garbage.
        return self::isValid($value) ? $value : self::DEFAULT;
    }

    /**
     * @phpstan-assert-if-true non-falsy-string $value PATTERN anchors on [a-z], so a match
     * can never be empty or "0".
     */
    public static function isValid(mixed $value): bool
    {
        return is_string($value) && $value !== self::RESERVED && preg_match(self::PATTERN, $value) === 1;
    }
}
