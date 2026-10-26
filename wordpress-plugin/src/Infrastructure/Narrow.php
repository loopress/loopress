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
        $map = [];
        foreach (is_array($value) ? $value : [] as $key => $item) {
            if (is_string($key)) {
                $map[$key] = $item;
            }
        }

        return $map;
    }

    /**
     * Narrow::map() keeping only the string values, e.g. a package or fingerprint map.
     *
     * @return array<string, string>
     */
    public static function stringMap(mixed $value): array
    {
        $map = [];
        foreach (self::map($value) as $key => $item) {
            if (is_string($item)) {
                $map[$key] = $item;
            }
        }

        return $map;
    }
}
