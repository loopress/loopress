<?php

declare(strict_types=1);

namespace Loopress\Tests\Stubs;

use Loopress\Infrastructure\Narrow;

// Minimal stand-in for $wpdb around a MySQL named lock (GET_LOCK/RELEASE_LOCK): granted unless
// a test sets $lockResult to '0', every query recorded. Used by PagesControllerTest and
// PushesControllerTest.
final class FakeLockWpdb
{
    public string $prefix     = 'wp_';
    public string $lockResult = '1';
    /** @var string[] */
    public array $queries = [];

    public function prepare(string $query, mixed ...$args): string
    {
        return vsprintf(str_replace(['%s', '%d'], ["'%s'", '%d'], $query), array_map(Narrow::string(...), $args));
    }

    public function get_var(string $query): string
    {
        $this->queries[] = $query;
        return $this->lockResult;
    }

    public function query(string $query): int
    {
        $this->queries[] = $query;
        return 1;
    }
}
