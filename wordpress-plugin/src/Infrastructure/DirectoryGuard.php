<?php

declare(strict_types=1);

namespace Loopress\Infrastructure;

/**
 * Write-once anti-listing files for a Loopress-managed directory under wp-content/: an empty
 * index.php (defense in depth against directory listing) and/or an .htaccess whose content is
 * the caller's to decide (deny-all for vendor/, PHP-off for apps/, ...). Lives outside the
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

    public static function writeHtaccessIfMissing(string $dir, string $contents): void
    {
        $file = $dir . '.htaccess';
        if (!file_exists($file)) {
            file_put_contents($file, $contents); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
        }
    }
}
