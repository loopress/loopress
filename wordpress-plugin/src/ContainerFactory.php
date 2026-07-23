<?php

declare(strict_types=1);

namespace Loopress;

use DI\Container;
use DI\ContainerBuilder;

/**
 * Single composition root for the plugin's PHP-DI container. Compilation skips PHP-DI's
 * reflection-based autowiring on every request; only worth paying the file-write cost
 * outside WP_DEBUG, where a developer actively changing wiring would otherwise need to
 * clear a stale compiled container by hand.
 */
class ContainerFactory
{
    /** @param array<string, mixed> $definitions */
    public static function create(array $definitions): Container
    {
        if (!(defined('WP_DEBUG') && WP_DEBUG)) {
            // Compilation writes to disk on first boot; some hosts won't let the webserver
            // user write there (e.g. plugin files installed as a different user), which
            // throws from deep inside PHP-DI. That's fine to lose the perf optimization
            // over, but plugins_loaded runs this on every single request, so an uncaught
            // exception here would fatal the whole site, wp-login.php included, not just
            // Loopress: never let that failure escape.
            try {
                $builder = new ContainerBuilder();
                $builder->addDefinitions($definitions);
                $builder->enableCompilation(self::cacheDir());

                return $builder->build();
            } catch (\Throwable) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch
                // Intentionally empty: falls through to the uncompiled build below.
            }
        }

        $builder = new ContainerBuilder();
        $builder->addDefinitions($definitions);

        return $builder->build();
    }

    private static function cacheDir(): string
    {
        // Mirrors Dependencies\Infrastructure\LoopressEnvironment's own wp-content/loopress/:
        // wp-content/ is expected to be writable by the webserver (uploads, caches, ...),
        // unlike the plugin's own directory, which a real install may have extracted as a
        // different user (e.g. `wp plugin install` run as root).
        return defined('WP_CONTENT_DIR')
            ? WP_CONTENT_DIR . '/loopress/container-cache'
            : sys_get_temp_dir() . '/loopress-container-cache';
    }
}
