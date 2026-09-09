<?php

declare(strict_types=1);

namespace Loopress\Options\Service;

use Loopress\Options\Exception\ReservedOptionNameException;
use Loopress\Options\Exception\UnsupportedOptionValueException;

// Direct, agnostic access to the wp_options table: no adapter, no per-plugin knowledge, unlike
// Seo\Service\* which has to know which option name each SEO plugin uses. Every option name is
// fair game except the reserved list below, already owned by another Loopress resource.
class OptionsService
{
    // Already synced by the `plugin`/`theme` resources; see the exception's own docblock.
    private const RESERVED_NAMES = ['active_plugins', 'stylesheet', 'template'];

    // Every option name WordPress core itself creates on install, extracted verbatim from
    // wp-admin/includes/schema.php's populate_options() (verified against a real 6.9 install,
    // not reconstructed from memory) plus 'initial_db_version' (added just after that array, on
    // non-multisite installs). A name in this list is core with certainty; a name absent from it
    // is simply "not one of these", not proven to be a plugin's, so this stays a strict allowlist
    // rather than growing with guesses.
    private const CORE_DEFAULT_OPTION_NAMES = [
        'active_plugins', 'admin_email', 'admin_email_lifespan', 'auto_plugin_theme_update_emails', 'auto_update_core_dev', 'auto_update_core_major',
        'auto_update_core_minor', 'avatar_default', 'avatar_rating', 'blog_charset', 'blog_public', 'blogdescription',
        'blogname', 'category_base', 'close_comments_days_old', 'close_comments_for_old_posts', 'comment_max_links', 'comment_moderation',
        'comment_order', 'comment_previously_approved', 'comment_registration', 'comments_notify', 'comments_per_page', 'date_format',
        'db_version', 'default_category', 'default_comment_status', 'default_comments_page', 'default_email_category', 'default_link_category',
        'default_ping_status', 'default_pingback_flag', 'default_post_format', 'default_role', 'disallowed_keys', 'finished_splitting_shared_terms',
        'gmt_offset', 'hack_file', 'home', 'html_type', 'image_default_align', 'image_default_link_type',
        'image_default_size', 'initial_db_version', 'large_size_h', 'large_size_w', 'link_manager_enabled', 'links_updated_date_format',
        'mailserver_login', 'mailserver_pass', 'mailserver_port', 'mailserver_url', 'medium_large_size_h', 'medium_large_size_w',
        'medium_size_h', 'medium_size_w', 'moderation_keys', 'moderation_notify', 'page_comments', 'page_for_posts',
        'page_on_front', 'permalink_structure', 'ping_sites', 'posts_per_page', 'posts_per_rss', 'recently_edited',
        'require_name_email', 'rewrite_rules', 'rss_use_excerpt', 'show_avatars', 'show_comments_cookies_opt_in', 'show_on_front',
        'site_icon', 'siteurl', 'start_of_week', 'sticky_posts', 'stylesheet', 'tag_base',
        'template', 'thread_comments', 'thread_comments_depth', 'thumbnail_crop', 'thumbnail_size_h', 'thumbnail_size_w',
        'time_format', 'timezone_string', 'uninstall_plugins', 'upload_path', 'upload_url_path', 'uploads_use_yearmonth_folders',
        'use_balanceTags', 'use_smilies', 'use_trackback', 'users_can_register', 'widget_categories', 'widget_rss',
        'widget_text', 'wp_attachment_pages_enabled', 'wp_force_deactivated_plugins', 'wp_notes_notify', 'wp_page_for_privacy_policy',
    ];

    /** @return array<int, array{name: string, autoload: string, core: bool, guess: string|null}> */
    public function listOptionNames(): array
    {
        global $wpdb;

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT option_name, autoload FROM {$wpdb->options} " .
                    'WHERE option_name NOT LIKE %s AND option_name NOT LIKE %s ORDER BY option_name',
                $wpdb->esc_like('_transient_') . '%',
                $wpdb->esc_like('_site_transient_') . '%',
            ),
            ARRAY_A,
        );

        $pluginPrefixes = $this->activePluginPrefixes();

        return array_map(function (array $row) use ($pluginPrefixes): array {
            $name = (string) $row['option_name'];
            $core = in_array($name, self::CORE_DEFAULT_OPTION_NAMES, true);

            return [
                'name'     => $name,
                'autoload' => (string) $row['autoload'],
                'core'     => $core,
                // Never guessed for a name already confirmed core: pointless, and a plugin slug
                // could coincidentally prefix-match one, muddying an otherwise certain answer.
                'guess'    => $core ? null : $this->guessSource($name, $pluginPrefixes),
            ];
        }, $rows);
    }

    // Below this, a slug's first hyphen-segment ("seo" from "seo-by-rank-math") is too generic to
    // trust as a prefix candidate on its own; it would match unrelated options from any plugin.
    private const MIN_GUESS_SEGMENT_LENGTH = 4;

    // Best-effort only, unlike CORE_DEFAULT_OPTION_NAMES above: WordPress has no field linking an
    // option row to whichever plugin created it, so this is a naive prefix match against active
    // plugins' folder slugs (dashes to underscores), plus the slug's first hyphen-segment as a
    // fallback (WordPress.org marketing suffixes like "-lite"/"-pro" routinely don't appear in the
    // plugin's own option prefix: confirmed live, "wpforms-lite" only matches via "wpforms").
    // Still expected to miss real matches whose prefix has no string relationship to the slug at
    // all (Yoast: slug "wordpress-seo", prefix "wpseo_"; RankMath: slug "seo-by-rank-math", prefix
    // "rank_math_") and, in principle, could false-positive on an unrelated option that happens to
    // share a prefix; callers must treat a non-null result as a hint, never a fact.
    /** @return array<string, string> option-name prefix (with trailing underscore) => plugin slug */
    private function activePluginPrefixes(): array
    {
        $active = get_option('active_plugins', []);
        if (!is_array($active)) {
            return [];
        }

        $prefixes = [];
        foreach ($active as $entry) {
            if (!is_string($entry) || !str_contains($entry, '/')) {
                continue; // a single-file plugin (e.g. hello.php) has no folder slug to guess from
            }

            $slug = (string) strstr($entry, '/', true);
            if ($slug === '') {
                continue;
            }

            $candidates = [$slug];
            $firstSegment = strstr($slug, '-', true);
            if ($firstSegment !== false && strlen($firstSegment) >= self::MIN_GUESS_SEGMENT_LENGTH) {
                $candidates[] = $firstSegment;
            }

            foreach ($candidates as $candidate) {
                $prefix = str_replace('-', '_', $candidate) . '_';
                // First plugin to claim a prefix wins; a second, unrelated plugin colliding on
                // the same guessed prefix is rare enough not to warrant tracking every claimant.
                $prefixes[$prefix] ??= $slug;
            }
        }

        return $prefixes;
    }

    /** @param array<string, string> $pluginPrefixes */
    private function guessSource(string $name, array $pluginPrefixes): ?string
    {
        // A leading underscore commonly marks "internal" data (WordPress's own convention for
        // protected postmeta, echoed by some plugins for options too, e.g. WPForms' transients);
        // stripped before matching so it doesn't defeat an otherwise-correct prefix guess.
        $normalized = ltrim($name, '_');

        foreach ($pluginPrefixes as $prefix => $slug) {
            if (str_starts_with($normalized, $prefix)) {
                return $slug;
            }
        }

        return null;
    }

    /** @return array{name: string, value: mixed, autoload: string}|null */
    public function getOption(string $name): ?array
    {
        // A unique object, never a value any option could genuinely hold, so it unambiguously
        // marks "not found": get_option()'s own default (false) is also a value the option can
        // legitimately be set to, and could not tell the two cases apart.
        $sentinel = new \stdClass();
        $value    = get_option($name, $sentinel);
        if ($value === $sentinel) {
            return null;
        }

        $this->assertJsonSafe($name, $value);

        global $wpdb;
        $autoload = $wpdb->get_var($wpdb->prepare("SELECT autoload FROM {$wpdb->options} WHERE option_name = %s", $name));

        return ['name' => $name, 'value' => $value, 'autoload' => $autoload === null ? 'yes' : (string) $autoload];
    }

    /** @return array{name: string, value: mixed, autoload: string} */
    public function updateOption(string $name, mixed $value, ?string $autoload): array
    {
        $this->assertNotReserved($name);

        // update_option() returns false both on a genuine failure and when the new value equals
        // the old one (a no-op, not an error): re-reading afterwards is the only way to report
        // the actual resulting state either way, rather than treating that false as failure.
        // 'no'/'off' turn autoload off; WordPress itself reports either spelling depending on
        // version (confirmed live: a WordPress 6.6+ site reports 'on'/'off', not 'yes'/'no'),
        // and this service round-trips whatever it read, so both must be recognized on write or
        // an option pulled as "off" would silently flip back to autoloaded on the next push.
        update_option($name, $value, $autoload === null ? null : !in_array($autoload, ['no', 'off'], true));

        $result = $this->getOption($name);
        if ($result === null) {
            throw new \RuntimeException(esc_html("Failed to write option \"{$name}\"."));
        }

        return $result;
    }

    public function deleteOption(string $name): void
    {
        $this->assertNotReserved($name);

        delete_option($name);
    }

    private function assertNotReserved(string $name): void
    {
        if (in_array($name, self::RESERVED_NAMES, true)) {
            throw new ReservedOptionNameException(esc_html(
                "\"{$name}\" is managed by another Loopress resource (plugin/theme), not by option.",
            ));
        }
    }

    // Recurses through arrays only: a value holding anything else (a PHP object, a resource) has
    // no lossless JSON representation, and json_encode()-ing it anyway (WP_REST_Response's own
    // behavior) would silently produce something other than the real value instead of failing.
    private function assertJsonSafe(string $name, mixed $value): void
    {
        if ($value === null || is_scalar($value)) {
            return;
        }

        if (is_array($value)) {
            foreach ($value as $item) {
                $this->assertJsonSafe($name, $item);
            }

            return;
        }

        throw new UnsupportedOptionValueException(esc_html(
            "Option \"{$name}\" holds a PHP object, not plain JSON-safe data. Loopress cannot manage this option generically.",
        ));
    }
}
