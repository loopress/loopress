<?php

declare(strict_types=1);

namespace Loopress\Options\Service;

use Loopress\Options\Exception\ProtectedOptionException;
use Loopress\Options\Exception\ReservedOptionNameException;
use Loopress\Options\Exception\UnsupportedOptionValueException;

// Direct, agnostic access to the wp_options table: no adapter, no per-plugin knowledge, unlike
// Seo\Service\* which has to know which option name each SEO plugin uses. Every option name is
// fair game except the reserved list below, already owned by another Loopress resource, the
// safety denylists (see assertReadable()/assertWritable()), and anything a site rules out via
// the loopress_option_readable / loopress_option_writable filters.
class OptionsService
{
    // Already synced by the `plugin`/`theme` resources; see the exception's own docblock.
    private const RESERVED_NAMES = ['active_plugins', 'stylesheet', 'template'];

    // Core options whose value changes how the site behaves: a generic option-write primitive
    // must not be an escalation path (F11). `default_role` + `users_can_register` turn every
    // public sign-up into an admin; `siteurl`/`home` hijack asset loading and redirects; `cron`
    // reschedules tasks; `uninstall_plugins` runs code on delete; `mailserver_*` is the POP3
    // fetch account; `db_version` downgrades trigger a migration. A site that genuinely needs
    // to manage one of these through Loopress can re-allow it via the loopress_option_writable
    // filter.
    private const DENY_WRITE_NAMES = [
        'default_role', 'users_can_register', 'siteurl', 'home', 'cron', 'uninstall_plugins',
        'mailserver_url', 'mailserver_login', 'mailserver_pass', 'mailserver_port',
        'db_version', 'initial_db_version',
    ];

    // Best-effort denylist for reads: a name matching one of these looks like a stored secret,
    // and the option resource is not meant to be "GET every credential in wp_options" (F10).
    // Deliberately not exhaustive (a denylist of secret names always leaks: `stripe_sk`,
    // `mailgun_apikey`, ...); the real control for a specific site is the
    // loopress_option_readable filter, or tracking only the options it needs.
    private const DENY_READ_PATTERNS = [
        '/secret/i', '/password/i', '/_pass$/i', '/passwd/i', '/token/i', '/_key$/i',
        '/_api_key$/i', '/apikey$/i', '/^auth_/i', '/nonce/i', '/salt/i', '/private_key/i',
        '/credential/i',
    ];

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

    // A second, separately verified batch: real WordPress core options that populate_options()
    // does not create at install time (they're written later, by other core code paths), each
    // confirmed by grepping a real install's wp-admin/wp-includes for an add_option()/
    // update_option()/get_option() call on that literal name (not reconstructed from memory).
    // Added specifically because source-scanning (below) was misattributing several of these to
    // "Plugin Check" (a WordPress.org code-quality linter): its own rules reference a long list
    // of core option names to check other plugins don't misuse them, which makes it, and tools
    // like it, a predictable source of false attribution for exactly this class of name.
    private const OTHER_KNOWN_CORE_OPTION_NAMES = [
        'can_compress_scripts', 'cron', 'finished_updating_comment_type', 'recently_activated', 'recovery_keys',
        'sidebars_widgets', 'user_count', 'widget_block', 'wp_user_roles', 'WPLANG',
    ];

    // Scans active plugins' own PHP source (see scanActivePluginSourceForOptions()/phpFilesIn())
    // for every option the (much cheaper) naming guess left unresolved, to find new guesses:
    // roughly 1-3s on a real site, every active plugin's tree, once. `confirmed` is set for a
    // scan hit (real code evidence), never for a naming-only match: a naming guess with no code
    // evidence for it stays honestly uncertain rather than being upgraded on weaker grounds (an
    // earlier version tried to also re-scan just the one plugin each naming guess already points
    // at to upgrade it; dropped, the naming heuristic has not produced a false positive in
    // testing, so spending a second scan pass just to remove its "?" marker wasn't solving a
    // real problem).
    /** @return array<int, array{name: string, autoload: string, core: bool, guess: string|null, confirmed: bool, pluginName: string|null}> */
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

        $options = array_map(function (array $row) use ($pluginPrefixes): array {
            $name = (string) $row['option_name'];
            $core = in_array($name, self::CORE_DEFAULT_OPTION_NAMES, true)
                || in_array($name, self::OTHER_KNOWN_CORE_OPTION_NAMES, true);

            return [
                'name'       => $name,
                'autoload'   => (string) $row['autoload'],
                'core'       => $core,
                // Never guessed for a name already confirmed core: pointless, and a plugin slug
                // could coincidentally prefix-match one, muddying an otherwise certain answer.
                'guess'      => $core ? null : $this->guessSource($name, $pluginPrefixes),
                'confirmed'  => false,
                'pluginName' => null,
            ];
        }, $rows);

        return $this->attachPluginNames($this->applySourceScan($options));
    }

    /**
     * Translates a guessed slug ("insert-headers-and-footers") into the plugin's declared,
     * human-readable Name header ("WPCode"): a plain header read on the one guessed plugin's
     * main file, not a source scan, so it stays cheap regardless of how many options are listed.
     * Only ever looked up for slugs actually guessed above, never every active plugin.
     *
     * @param array<int, array{name: string, autoload: string, core: bool, guess: string|null, confirmed: bool, pluginName: string|null}> $options
     * @return array<int, array{name: string, autoload: string, core: bool, guess: string|null, confirmed: bool, pluginName: string|null}>
     */
    private function attachPluginNames(array $options): array
    {
        $guessedSlugs = array_values(array_unique(array_filter(array_map(
            static fn(array $option): ?string => $option['guess'],
            $options,
        ))));

        $names = $this->pluginDisplayNames($guessedSlugs);

        return array_map(static function (array $option) use ($names): array {
            if ($option['guess'] !== null) {
                $option['pluginName'] = $names[$option['guess']] ?? null;
            }

            return $option;
        }, $options);
    }

    /**
     * @param array<int, string> $slugs
     * @return array<string, string> plugin slug => declared plugin Name (a slug missing its own
     *         header, or no longer active, is simply absent from the result, decoration only)
     */
    private function pluginDisplayNames(array $slugs): array
    {
        if ($slugs === [] || !defined('WP_PLUGIN_DIR')) {
            return [];
        }

        $entries = $this->activePluginEntries();

        $names = [];
        foreach ($slugs as $slug) {
            $entry = $entries[$slug] ?? null;
            $path = $entry === null ? null : WP_PLUGIN_DIR . '/' . $entry;
            if ($path === null || !is_file($path)) {
                continue;
            }

            // get_file_data() reads just the declared header fields (a small prefix of the
            // file), the same lightweight mechanism this plugin's own loopress.php uses for its
            // own Version header, not a full parse or execution of the plugin's code. The header
            // label really is "Plugin Name:" (WP core's own get_plugin_data() searches for the
            // same 'Plugin Name' string, "Name" alone never matches).
            $name = (string) get_file_data($path, ['Name' => 'Plugin Name'])['Name'];
            if ($name !== '') {
                $names[$slug] = $name;
            }
        }

        return $names;
    }

    /**
     * @param array<int, array{name: string, autoload: string, core: bool, guess: string|null, confirmed: bool, pluginName: string|null}> $options
     * @return array<int, array{name: string, autoload: string, core: bool, guess: string|null, confirmed: bool, pluginName: string|null}>
     */
    private function applySourceScan(array $options): array
    {
        // Only what the cheap heuristic above left unresolved: no point re-scanning gigabytes of
        // plugin source for a name already certain (core) or already guessed by name.
        $unresolved = array_values(array_map(
            static fn(array $option): string => $option['name'],
            array_filter($options, static fn(array $option): bool => !$option['core'] && $option['guess'] === null),
        ));

        $sourceHits = $this->scanActivePluginSourceForOptions($unresolved);

        return array_map(static function (array $option) use ($sourceHits): array {
            $hits = $sourceHits[$option['name']] ?? [];
            // Found in more than one active plugin's code (a linter/scanner referencing a name it
            // checks for, without owning it, is the common real cause): honestly "don't know"
            // beats picking one of several candidates or listing all of them as if equally likely.
            if (count($hits) === 1) {
                $option['guess']     = $hits[0];
                // A real scan hit, not just a naming pattern: confirmed outright.
                $option['confirmed'] = true;
            }

            return $option;
        }, $options);
    }

    /**
     * One pass per active plugin file (not per option name): each file is read once, then tested
     * against every still-unresolved option name in memory, rather than re-reading every file
     * once per name. Matches a quoted PHP string literal ('name' or "name"), not a raw substring,
     * to avoid a false hit from an unrelated word merely containing the option name.
     *
     * Reports every plugin whose source matched, not just one: a plugin checking
     * `if (get_option('wpseo_titles'))` to detect Yoast, without being Yoast, is a real, common
     * pattern this can't distinguish from real ownership on its own, so listOptionNames() (the
     * only caller) treats more than one hit as ambiguous and shows neither, rather than picking
     * one arbitrarily.
     *
     * @param array<int, string> $unresolvedNames
     * @return array<string, array<int, string>> option name => plugin slugs whose source
     *         references it
     */
    private function scanActivePluginSourceForOptions(array $unresolvedNames): array
    {
        if ($unresolvedNames === [] || !defined('WP_PLUGIN_DIR')) {
            return [];
        }

        $hits = [];
        foreach (array_keys($this->activePluginEntries()) as $slug) {
            $pluginDir = WP_PLUGIN_DIR . '/' . $slug;
            if (!is_dir($pluginDir)) {
                continue;
            }

            foreach ($this->phpFilesIn($pluginDir) as $file) {
                $content = file_get_contents($file); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
                if ($content === false) {
                    continue;
                }

                foreach ($unresolvedNames as $name) {
                    if (self::containsQuotedName($content, $name)) {
                        $hits[$name][] = $slug;
                    }
                }
            }
        }

        foreach ($hits as $name => $slugs) {
            $hits[$name] = array_values(array_unique($slugs));
        }

        return $hits;
    }

    private static function containsQuotedName(string $content, string $name): bool
    {
        return str_contains($content, "'{$name}'") || str_contains($content, "\"{$name}\"");
    }

    // Pruned before descending (not filtered after), so traversal never opens these directories
    // at all: this is most of the win (confirmed live: ~10-17s down to ~1.5-2.5s on a real site,
    // one active plugin's bundled QA-tool vendor/ alone was 19 of its 20MB). Justified, not
    // arbitrary: WordPress.org plugins keep third-party code, fixtures, and translation files out
    // of the PHP that actually calls get_option()/update_option() for the plugin's own options.
    private const SKIPPED_DIR_NAMES = ['vendor', 'node_modules', 'tests', 'test', 'languages'];

    /** @return \Generator<string> */
    private function phpFilesIn(string $dir): \Generator
    {
        $filter = new \RecursiveCallbackFilterIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            static function (mixed $current): bool {
                if (!$current instanceof \SplFileInfo) {
                    return true;
                }

                return !$current->isDir() || !in_array($current->getFilename(), self::SKIPPED_DIR_NAMES, true);
            },
        );
        $iterator = new \RecursiveIteratorIterator($filter);

        foreach ($iterator as $file) {
            if ($file instanceof \SplFileInfo && $file->isFile() && $file->getExtension() === 'php') {
                yield $file->getPathname();
            }
        }
    }

    /** @return array<string, string> plugin slug => active_plugins entry (slug/main-file.php) */
    private function activePluginEntries(): array
    {
        $active = get_option('active_plugins', []);
        if (!is_array($active)) {
            return [];
        }

        $entries = [];
        foreach ($active as $entry) {
            if (!is_string($entry) || !str_contains($entry, '/')) {
                continue; // a single-file plugin (e.g. hello.php) has no folder slug
            }

            $slug = (string) strstr($entry, '/', true);
            if ($slug !== '') {
                $entries[$slug] = $entry;
            }
        }

        return $entries;
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
        $prefixes = [];
        foreach (array_keys($this->activePluginEntries()) as $slug) {
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
        $this->assertReadable($name);

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
        $this->assertWritable($name);

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
        $this->assertWritable($name);

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

    // Refuses to hand back a value whose name looks like a stored secret (F10). A site that
    // genuinely tracks an option with such a name can re-allow that one name through the
    // filter (`add_filter('loopress_option_readable', fn($ok, $name) => $name === 'my_key' ?
    // true : $ok, 10, 2)`).
    private function assertReadable(string $name): void
    {
        $denied = false;
        foreach (self::DENY_READ_PATTERNS as $pattern) {
            if (preg_match($pattern, $name) === 1) {
                $denied = true;
                break;
            }
        }

        if (!apply_filters('loopress_option_readable', !$denied, $name)) {
            throw new ProtectedOptionException(esc_html(
                "\"{$name}\" looks like a stored secret and is not readable through the option resource. " .
                'Allow it explicitly with the loopress_option_readable filter if that is wrong.',
            ));
        }
    }

    // Refuses to write a core option that changes site behaviour, or any loopress_* option
    // (owned by the plugin's own settings), so a generic write primitive is not an escalation
    // path (F11). Re-allow a specific name via the loopress_option_writable filter.
    private function assertWritable(string $name): void
    {
        $denied = in_array($name, self::DENY_WRITE_NAMES, true) || str_starts_with($name, 'loopress_');

        if (!apply_filters('loopress_option_writable', !$denied, $name)) {
            throw new ProtectedOptionException(esc_html(
                "\"{$name}\" is a protected option and cannot be written through the option resource. " .
                'Allow it explicitly with the loopress_option_writable filter if you need to.',
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
