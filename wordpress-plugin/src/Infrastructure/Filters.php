<?php

declare(strict_types=1);

namespace Loopress\Infrastructure;

/**
 * Typed readers for apply_filters(), which returns whatever the last callback returned.
 */
final class Filters
{
    // A callback returning something non-numeric keeps $fallback, rather than casting it to 0.
    /** @param non-empty-string $hook */
    public static function int(string $hook, int $fallback, mixed ...$args): int
    {
        $value = apply_filters($hook, $fallback, ...$args);

        return is_numeric($value) ? (int) $value : $fallback;
    }
}
