<?php

declare(strict_types=1);

namespace Loopress\Api\Infrastructure;

/**
 * Injects/removes the ABSPATH guard that protects a deployed api/ file from direct HTTP
 * access (wp-content/ is under the public webroot, see obsidian/Product/Custom API Routes.md
 * "Protection contre l'accès direct au fichier"). A regex locates the real declare() line as
 * written (tolerant to spacing), str_replace does the actual insertion/removal on that exact
 * text so the logic itself stays simple.
 */
class FileWriter
{
    private const DECLARE_PATTERN = '/declare\s*\(\s*strict_types\s*=\s*1\s*\)\s*;/';
    private const GUARD = "\nif (!defined('ABSPATH')) {\n    exit;\n}\n";

    public static function withGuard(string $code): string
    {
        if (preg_match(self::DECLARE_PATTERN, $code, $matches) !== 1) {
            throw new \InvalidArgumentException('File must contain declare(strict_types=1);');
        }

        $declareLine = $matches[0];

        // str_replace replaces every occurrence of $declareLine, not just the first: if it
        // appears more than once (e.g. inside a comment), $count catches it below and the
        // file is rejected rather than guarded twice.
        $result = str_replace($declareLine, $declareLine . self::GUARD, $code, $count);

        if ($count !== 1) {
            throw new \InvalidArgumentException('declare(strict_types=1); must appear exactly once');
        }

        return $result;
    }

    // Inverse of withGuard(), used when serving a file back to `lps api pull`/`lps api list`
    // so the CLI always writes a pristine source file locally, never the generated guard.
    public static function stripGuard(string $code): string
    {
        return str_replace(self::GUARD, '', $code);
    }
}
