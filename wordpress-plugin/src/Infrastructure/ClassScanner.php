<?php

declare(strict_types=1);

namespace Loopress\Infrastructure;

/**
 * Finds the class(es) a PHP source string declares, without ever require()ing or eval()ing
 * it: token_get_all() only lexes, so this is safe to run on untrusted/unverified content
 * (RouteLoader/HookLoader, before deciding whether a file is safe to require; ApiFilesController/
 * HookFilesController, before a file is even written to disk). Replaces the old "kebab-case
 * filename -> PascalCase class" naming convention (see the plugin's "Convention de fichier"
 * doc): the class name is now whatever the developer actually wrote, discovered by reading the
 * file itself. Shared between Api and Hooks (both need the identical one-class-per-file
 * discovery), lives outside both Full-only feature directories same as DirectoryGuard: nothing
 * here is specific to either.
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

    // Finds the first statement at the top level (brace-depth 0, outside any class/function
    // body) that would EXECUTE when the file is require()d by RouteLoader/HookLoader at boot.
    // The one-class-per-file check counts classes but says nothing about what else the file
    // does: a file with `system($_GET['c']);` next to its class still declares exactly one
    // class, yet that call runs on every REST request the loader boots for (LP-SEC, verified
    // live: stray top-level output corrupts every /wp-json/ response). Only declarations and
    // imports are allowed at the top level (namespace, use, const, attributes, and the
    // class/interface/trait/enum/function declaration itself); anything else is a side effect.
    // Returns a short description of the first offending token (for the error message), or null
    // when the file is inert until its class is used. Tokeniser-only, same as declaredClasses():
    // never require()s or eval()s the content.
    public static function firstTopLevelSideEffect(string $content): ?string
    {
        $allowed = [T_DECLARE, T_NAMESPACE, T_USE, T_CONST, T_CLASS, T_ABSTRACT, T_FINAL, T_INTERFACE, T_TRAIT, T_FUNCTION];
        foreach (['T_READONLY', 'T_ENUM', 'T_ATTRIBUTE'] as $optional) {
            if (defined($optional)) {
                $allowed[] = constant($optional);
            }
        }

        $tokens  = @token_get_all($content); // phpcs:ignore WordPress.PHP.NoSilencedErrors -- unverified push content, malformed input expected
        $depth   = 0;
        $atStart = true; // at the beginning of a statement (right after <?php, ';' or a closing '}')

        foreach ($tokens as $token) {
            if (is_array($token)) {
                [$id] = $token;

                if (in_array($id, [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
                    continue;
                }

                // An open/close PHP tag begins a fresh statement; the interpolation-brace tokens
                // ("{$x}", "${x}") open a nested context that a plain '}' string token closes, so
                // they count toward depth just like a literal '{'.
                if ($id === T_OPEN_TAG || $id === T_CLOSE_TAG) {
                    $atStart = true;
                    continue;
                }
                if ((defined('T_CURLY_OPEN') && $id === T_CURLY_OPEN)
                    || (defined('T_DOLLAR_OPEN_CURLY_BRACES') && $id === T_DOLLAR_OPEN_CURLY_BRACES)) {
                    ++$depth;
                    continue;
                }

                if ($depth === 0 && $atStart) {
                    if (!in_array($id, $allowed, true)) {
                        return token_name($id);
                    }
                    $atStart = false; // consumed this statement's leading keyword
                }

                continue;
            }

            // Single-character tokens: braces track nesting, ';' ends a top-level statement.
            if ($token === '{') {
                // A '{' at a top-level statement boundary is a bare block ("{ system(...); }"),
                // whose body runs at load time; only a class/function body '{' is legitimate and
                // that always follows its declaration keyword (so $atStart is already false).
                if ($depth === 0 && $atStart) {
                    return '{';
                }
                ++$depth;
            } elseif ($token === '}') {
                if ($depth > 0) {
                    --$depth;
                }
                if ($depth === 0) {
                    $atStart = true;
                }
            } elseif ($token === ';') {
                if ($depth === 0) {
                    $atStart = true;
                }
            } elseif ($depth === 0 && $atStart) {
                // A statement that starts with punctuation at the top level (grouping '(',
                // a backtick shell-exec, ...) is not a declaration: it executes.
                return $token;
            }
        }

        return null;
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
