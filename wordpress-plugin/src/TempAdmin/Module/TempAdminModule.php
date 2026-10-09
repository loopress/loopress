<?php

declare(strict_types=1);

namespace Loopress\TempAdmin\Module;

use Loopress\Contract\Module;
use Loopress\TempAdmin\Infrastructure\TempAdminSweeper;

/**
 * Hourly sweep of leftover temporary admins, plus a wp-admin notice naming any still present,
 * so a site owner sees it even when WP-Cron is slow to run (low traffic, DISABLE_WP_CRON).
 */
class TempAdminModule implements Module
{
    public function __construct(private readonly TempAdminSweeper $sweeper)
    {
    }

    public function boot(): void
    {
        add_action(TempAdminSweeper::CRON_HOOK, [$this->sweeper, 'sweep']);
        // ponytail: never unscheduled on deactivation, the event then fires with no callback,
        // which WordPress ignores. Add a deactivation hook if that ever shows up somewhere.
        add_action('init', static function (): void {
            if (!wp_next_scheduled(TempAdminSweeper::CRON_HOOK)) {
                wp_schedule_event(time(), 'hourly', TempAdminSweeper::CRON_HOOK);
            }
        });
        add_action('admin_notices', [$this, 'renderNotice']);
    }

    public function renderNotice(): void
    {
        if (!current_user_can('delete_users')) {
            return;
        }

        $users = $this->sweeper->find();
        if ($users === []) {
            return;
        }

        $names   = implode(', ', array_map(static fn(object $user): string => $user->user_login, $users));
        $message = sprintf(
            /* translators: %s: comma-separated usernames */
            __('Loopress found a temporary administrator account left behind by an interrupted install: %s. Loopress removes it automatically, or you can delete it now from Users.', 'loopress'),
            $names,
        );

        echo '<div class="notice notice-warning"><p>' . esc_html($message) . '</p></div>';
    }
}
