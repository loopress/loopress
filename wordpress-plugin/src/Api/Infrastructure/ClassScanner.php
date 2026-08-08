<?php

declare(strict_types=1);

namespace Loopress\Api\Infrastructure;

/**
 * Finds the class(es) a PHP source string declares, without ever require()ing or eval()ing
 * it: token_get_all() only lexes, so this is safe to run on untrusted/unverified content
 * (RouteLoader, before deciding whether a file is safe to require; ApiFilesController, before
 * a file is even written to disk). Replaces the old "kebab-case filename -> PascalCase class"
 * naming convention (see the plugin's "Convention de fichier" doc): the class name is now
 * whatever the developer actually wrote, discovered by reading the file itself.
 */
final class ClassScanner
{
    /** @return string[] fully-qualified class names, in declaration order; empty if none. */
    public static function declaredClasses(string $content): array
    {
        $tokens    = @token_get_all($content); // phpcs:ignore WordPress.PHP.NoSilencedErrors -- malformed input is expected (an unverified push/boot file), not a bug here
        $count     = count($tokens);
        $namespace = '';
        $classes   = [];

        for ($i = 0; $i < $count; $i++) {
            $token = $tokens[$i];
            if (!is_array($token)) {
                continue;
            }

            [$id] = $token;

            if ($id === T_NAMESPACE) {
                $namespace = self::readName($tokens, $i + 1) ?? '';
                continue;
            }

            if ($id !== T_CLASS) {
                continue;
            }

            // `Foo::class` tokenizes the `class` keyword as T_CLASS too, indistinguishable
            // from a declaration by that token alone; only the token just before it (the
            // `::`) tells them apart.
            if (self::previousSignificant($tokens, $i - 1) === T_DOUBLE_COLON) {
                continue;
            }

            $name = self::readName($tokens, $i + 1);
            if ($name === null) {
                continue; // anonymous class ("new class { ... }"): no name to instantiate later
            }

            $classes[] = $namespace === '' ? $name : $namespace . '\\' . $name;
        }

        return $classes;
    }

    /** @param array<int, array{0: int, 1: string, 2: int}|string> $tokens */
    private static function readName(array $tokens, int $i): ?string
    {
        $count = count($tokens);
        while ($i < $count && is_array($tokens[$i]) && in_array($tokens[$i][0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
            ++$i;
        }

        if ($i >= $count || !is_array($tokens[$i])) {
            return null;
        }

        // T_STRING: unqualified name (namespace's own segments, or a class with none). The
        // T_NAME_* family (PHP 8.0+) covers a namespace declared in one qualified/relative
        // token, e.g. `namespace Foo\Bar;`.
        $qualified = defined('T_NAME_QUALIFIED') ? [T_STRING, T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED, T_NAME_RELATIVE] : [T_STRING];
        if (!in_array($tokens[$i][0], $qualified, true)) {
            return null;
        }

        return ltrim($tokens[$i][1], '\\');
    }

    /** @param array<int, array{0: int, 1: string, 2: int}|string> $tokens */
    private static function previousSignificant(array $tokens, int $i): int|string|null
    {
        while ($i >= 0) {
            $token = $tokens[$i];
            if (is_array($token) && in_array($token[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
                --$i;
                continue;
            }

            return is_array($token) ? $token[0] : $token;
        }

        return null;
    }
}
