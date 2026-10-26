<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit;

/**
 * Reads a nested value out of a decoded payload or a captured argument, asserting every level
 * on the way, so a wrong shape fails the test instead of reading into `mixed`.
 */
trait DigsIntoArrays
{
    protected static function at(mixed $value, int|string ...$path): mixed
    {
        foreach ($path as $key) {
            self::assertIsArray($value);
            $value = $value[$key] ?? null;
        }

        return $value;
    }

    protected static function stringAt(mixed $value, int|string ...$path): string
    {
        $value = self::at($value, ...$path);
        self::assertIsString($value);

        return $value;
    }

    /** @return array<mixed> */
    protected static function arrayAt(mixed $value, int|string ...$path): array
    {
        $value = self::at($value, ...$path);
        self::assertIsArray($value);

        return $value;
    }
}
