<?php

declare(strict_types=1);

namespace Loopress\TempAdmin\Infrastructure;

/**
 * Finds and deletes the CLI's leftover temporary admins. Matching both the username prefix
 * and the `.invalid` email (both set by cli/src/lib/temp-admin.ts) keeps a real user who
 * happens to be named `lps-temp-...` out of it.
 */
class TempAdminSweeper
{
    public const CRON_HOOK = 'loopress_sweep_temp_admins';

    private const PREFIX       = 'lps-temp-';
    private const EMAIL_DOMAIN = '@lps-temp.invalid';

    // An install in progress activates Full, then the CLI deletes its own account seconds
    // later: a fresh account is still in use, deleting it would fail that CLI run's cleanup.
    private const GRACE_SECONDS = 15 * 60;

    /** @return list<object{ID: string, user_login: string, user_email: string, user_registered: string}> */
    public function find(): array
    {
        /** @var list<object{ID: string, user_login: string, user_email: string, user_registered: string}> $users */
        $users = get_users([
            'search'         => self::PREFIX . '*',
            'search_columns' => ['user_login'],
            'fields'         => ['ID', 'user_login', 'user_email', 'user_registered'],
        ]);

        return array_values(array_filter(
            $users,
            static fn(object $user): bool => str_starts_with($user->user_login, self::PREFIX)
                && str_ends_with($user->user_email, self::EMAIL_DOMAIN),
        ));
    }

    public function sweep(): void
    {
        // Cron runs on the front end, where wp-admin's user functions aren't loaded.
        if (!function_exists('wp_delete_user')) {
            require_once ABSPATH . 'wp-admin/includes/user.php';
        }

        foreach ($this->find() as $user) {
            // user_registered is stored in UTC.
            if (time() - (int) strtotime($user->user_registered . ' UTC') < self::GRACE_SECONDS) {
                continue;
            }

            // No reassignment: the account never authors content, at most the plugin zip
            // WordPress keeps as a temporary attachment during an upload, which can go with it.
            wp_delete_user((int) $user->ID);
        }
    }
}
