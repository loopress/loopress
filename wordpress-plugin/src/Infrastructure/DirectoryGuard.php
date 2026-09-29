<?php

declare(strict_types=1);

namespace Loopress\Infrastructure;

/**
 * Anti-listing files for a Loopress-managed directory under wp-content/: an empty index.php
 * (defense in depth against directory listing, written once) and/or an .htaccess whose content is
 * the caller's to decide, kept up to date (deny-all for vendor/, PHP-off for apps/, ...). Lives outside the
 * Full-only feature directories: every caller today (Api, Apps, Dependencies) is Full-only, but
 * nothing here is specific to any of them, same reasoning as WpHttpClient.
 */
final class DirectoryGuard
{
    public static function writeIndexIfMissing(string $dir): void
    {
        $file = $dir . 'index.php';
        if (!file_exists($file)) {
            file_put_contents($file, "<?php\n// Silence is golden.\n"); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
        }
    }

    /** First line of every .htaccess Loopress writes: what marks a file as still Loopress-managed. */
    public const HTACCESS_MARKER = '# Loopress:';

    /**
     * Writes the .htaccess when it is missing, and rewrites it when Loopress's own content changed
     * (a plugin update adding a header, say), so sites that already have the file get the change
     * too. A file that no longer starts with HTACCESS_MARKER was taken over by the site owner and
     * is left alone.
     */
    public static function writeHtaccess(string $dir, string $contents): void
    {
        $file    = $dir . '.htaccess';
        $current = file_exists($file) ? file_get_contents($file) : null; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents

        if ($current === $contents) {
            return;
        }
        if (is_string($current) && !self::isLoopressManaged($file)) {
            return;
        }

        // Temp file + rename, atomic on the same filesystem: a concurrent request sees either the
        // old rules or the new ones, never a half-written deny-all. Apache refuses to serve .ht*.
        $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (file_put_contents($tmp, $contents) === false) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
            return;
        }
        if (!rename($tmp, $file)) { // phpcs:ignore WordPress.WP.AlternativeFunctions.rename_rename
            unlink($tmp); // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
        }
    }

    public static function isLoopressManaged(string $htaccess): bool
    {
        return str_starts_with((string) file_get_contents($htaccess), self::HTACCESS_MARKER); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
    }
}
