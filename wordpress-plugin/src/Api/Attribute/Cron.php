<?php

declare(strict_types=1);

namespace Loopress\Api\Attribute;

/**
 * Marks a route file's method as a WP-Cron callback. `recurrence` is any schedule name WP
 * recognizes (core: hourly, twicedaily, daily; or a custom one the developer's own code adds
 * via the standard `cron_schedules` filter). See RouteLoader::registerCron() for how it's
 * scheduled and bound.
 */
#[\Attribute(\Attribute::TARGET_METHOD)]
final class Cron
{
    public function __construct(
        public readonly string $recurrence,
        public readonly ?string $hook = null,
    ) {}
}
