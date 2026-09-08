<?php

declare(strict_types=1);

namespace Loopress\Hooks\Attribute;

/**
 * Marks a hooks/ file's method as a WP-Cron callback: a cron job is, mechanically, just an
 * add_action() bound to a hook that wp_schedule_event() arranges to fire later, the same
 * primitive #[Action] uses, only the trigger differs (a schedule instead of an existing WP
 * event). `recurrence` is any schedule name WP recognizes (core: hourly, twicedaily, daily; or
 * a custom one the developer's own code adds via the standard `cron_schedules` filter). See
 * HookLoader::registerCron() for how it's scheduled and bound.
 */
#[\Attribute(\Attribute::TARGET_METHOD)]
final class Cron
{
    public function __construct(
        public readonly string $recurrence,
        public readonly ?string $hook = null,
    ) {}
}
