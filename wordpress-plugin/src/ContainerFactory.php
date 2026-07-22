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
    private const CACHE_DIR = __DIR__ . '/../container-cache';

    /** @param array<string, mixed> $definitions */
    public static function create(array $definitions): Container
    {
        $builder = new ContainerBuilder();
        $builder->addDefinitions($definitions);

        if (!(defined('WP_DEBUG') && WP_DEBUG)) {
            $builder->enableCompilation(self::CACHE_DIR);
        }

        return $builder->build();
    }
}
