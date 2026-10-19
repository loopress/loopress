<?php

declare(strict_types=1);

namespace Loopress\Update;

/**
 * Discloses the opt-out usage ping in wp-admin right after activation, instead of leaving it
 * to the Settings tab only. Shown until an admin picks either answer; both answers are stored,
 * so "never decided" is simply the option being absent (also the state after a settings reset).
 * Handled on admin_init through a nonced query arg rather than admin-post.php, so there is no
 * redirect or exit, and removable_query_args strips the arg from the address bar afterwards.
 */
final class UsageStatsNotice
{
    private const ARG   = 'loopress_usage_stats';
    private const NONCE = 'loopress_usage_stats_notice';

    public function register(): void
    {
        add_action('admin_init', [$this, 'handleAnswer']);
        add_action('admin_notices', [$this, 'render']);
        add_filter('removable_query_args', static fn(array $args): array => [...$args, self::ARG, '_wpnonce']);
    }

    public function handleAnswer(): void
    {
        if (!isset($_GET[self::ARG]) || !current_user_can('manage_options')) {
            return;
        }
        check_admin_referer(self::NONCE);

        // Stored as 0/1, same reason as UsageStatsController::update_consent().
        update_option(UsageStats::OPTION, sanitize_key(wp_unslash($_GET[self::ARG])) === '1' ? 1 : 0);
    }

    public function render(): void
    {
        if (!current_user_can('manage_options') || get_option(UsageStats::OPTION) !== false) {
            return;
        }

        $message = __('Loopress Full sends anonymous usage statistics, at most twice a day: a random site identifier, the Loopress, WordPress and PHP versions, the site language, its timezone and its environment type. Never your site URL, email, content or plugin list.', 'loopress');

        // Same weight for both buttons on purpose: the notice exists to ask, not to nudge.
        printf(
            '<div class="notice notice-info"><p>%s</p><p><a class="button" href="%s">%s</a> <a class="button" href="%s">%s</a> %s</p></div>',
            esc_html($message),
            esc_url(wp_nonce_url(add_query_arg(self::ARG, '1'), self::NONCE)),
            esc_html__('Keep it on', 'loopress'),
            esc_url(wp_nonce_url(add_query_arg(self::ARG, '0'), self::NONCE)),
            esc_html__('Turn it off', 'loopress'),
            esc_html__('You can change this anytime in Loopress, Settings tab.', 'loopress'),
        );
    }
}
