<?php

declare(strict_types=1);

namespace Loopress\Infrastructure;

/**
 * Injects/removes the ABSPATH guard that protects a deployed api/ or hooks/ file from direct
 * HTTP access (wp-content/ is under the public webroot). A regex locates the real declare()
 * line as written (tolerant to spacing), str_replace does the actual insertion/removal on that
 * exact text so the logic itself stays simple. Shared between Api and Hooks, lives outside both
 * Full-only feature directories same as DirectoryGuard/ClassScanner: nothing here is specific
 * to either.
 */
class FileWriter
{
    private const DECLARE_PATTERN = '/declare\s*\(\s*strict_types\s*=\s*1\s*\)\s*;/';
    private const GUARD = "\nif (!defined('ABSPATH')) {\n    exit;\n}\n";

    // A semicolon-form namespace declaration (`namespace Foo\Bar;`) must be the very first
    // statement in the file after declare(), or PHP fatals with "namespace declaration
    // statement has to be the very first statement in the script" (only whitespace and
    // comments may sit between the two). `\G` anchors to the offset withGuard() passes in,
    // so this only matches a namespace declaration immediately following declare(), never one
    // reached by skipping over unrelated code.
    private const NAMESPACE_PATTERN = '/\G(?:\s+|\/\/[^\n]*\n|\/\*.*?\*\/)*namespace\s+[A-Za-z_]\w*(?:\\\\[A-Za-z_]\w*)*\s*;/s';

    public static function withGuard(string $code): string
    {
        if (preg_match(self::DECLARE_PATTERN, $code, $matches, PREG_OFFSET_CAPTURE) !== 1) {
            throw new \InvalidArgumentException('File must contain declare(strict_types=1);');
        }

        [$declareLine, $declareOffset] = $matches[0];

        // Guards against a file whose declare() line appears more than once (e.g. inside a
        // comment): a single, unambiguous insertion point is required.
        if (substr_count($code, $declareLine) !== 1) {
            throw new \InvalidArgumentException('declare(strict_types=1); must appear exactly once');
        }

        $insertAt = self::insertionPointAfter($code, $declareOffset + strlen($declareLine));

        return substr_replace($code, self::GUARD, $insertAt, 0);
    }

    // Where the guard actually goes: right after declare(), unless a namespace declaration
    // immediately follows it, in which case after that instead (see NAMESPACE_PATTERN).
    // Inserting between declare() and a semicolon-form namespace would otherwise produce a
    // syntactically invalid file that fatals on require, not merely a misplaced guard.
    private static function insertionPointAfter(string $code, int $declareEnd): int
    {
        if (preg_match(self::NAMESPACE_PATTERN, $code, $namespaceMatch, 0, $declareEnd) === 1) {
            return $declareEnd + strlen($namespaceMatch[0]);
        }

        return $declareEnd;
    }

    // Inverse of withGuard(), used when serving a file back to `lps api pull`/`lps api list`
    // so the CLI always writes a pristine source file locally, never the generated guard.
    public static function stripGuard(string $code): string
    {
        return str_replace(self::GUARD, '', $code);
    }
}
