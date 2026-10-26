<?php

declare(strict_types=1);

namespace Loopress\Infrastructure;

/**
 * Narrows a `mixed` (a REST param, a decoded JSON value, a stored option) to the type the code
 * needs. A scalar is cast exactly like `(string)`/`(int)` would, anything else (null, an array,
 * an object) gives $fallback instead of a warning or a TypeError.
 */
final class Narrow
{
    public static function string(mixed $value, string $fallback = ''): string
    {
        return is_scalar($value) ? (string) $value : $fallback;
    }

    public static function int(mixed $value, int $fallback = 0): int
    {
        return is_scalar($value) ? (int) $value : $fallback;
    }

    /**
     * A JSON object or an option map: its string keys, or [] when it isn't an array.
     *
     * @return array<string, mixed>
     */
    public static function map(mixed $value): array
    {
        return is_array($value) ? array_filter($value, 'is_string', ARRAY_FILTER_USE_KEY) : [];
    }
}
