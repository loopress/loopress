<?php

declare(strict_types=1);

namespace Loopress\PostTypes\Service;

use Loopress\PostTypes\Exception\InvalidPostTypeException;
use Loopress\PostTypes\Exception\StalePostTypeRevisionException;

// Custom post types declared in the project's `cpt/<slug>.json` files (`lps cpt push`): each one
// is the plain `register_post_type()` arguments, stored as data in one option and registered on
// every request. Data only, never code: arguments WordPress would call or instantiate are refused
// (CODE_ARGS), which is what keeps this resource in Loopress Light.
class PostTypeService
{
    public const OPTION = 'loopress_post_types';

    // Set by every write, consumed once on the next `init` (see flushIfNeeded()): rewrite rules
    // must be flushed after the changed post type is registered, never during the REST write
    // itself, and never on every request.
    public const FLUSH_OPTION = 'loopress_post_types_flush';

    // WordPress's own post types and the query vars its docs say a post type must not use.
    private const RESERVED_SLUGS = [
        'post', 'page', 'attachment', 'revision', 'nav_menu_item', 'custom_css', 'customize_changeset',
        'oembed_cache', 'user_request', 'action', 'author', 'order', 'theme',
    ];

    // Arguments WordPress calls (register_meta_box_cb) or instantiates as a class (the REST
    // controller ones): accepting them would turn a data file into a code deployment.
    private const CODE_ARGS = [
        'register_meta_box_cb', 'rest_controller_class', 'autosave_rest_controller_class', 'revisions_rest_controller_class',
    ];

    // Arguments WordPress uses as arrays (array_merge(), foreach) without checking first: a
    // string there is a fatal TypeError on every request. Value: what else it may be, if anything.
    private const ARRAY_ARGS = [
        'capabilities' => [], 'labels' => [], 'taxonomies' => [], 'template' => [],
        'supports' => [false], 'rewrite' => [true, false],
    ];

    /** @var array<string, object> The object each slug this request registered got, see register(). */
    private array $registered = [];

    /** @return list<array{slug: string, args: array<string, mixed>, revision: string}> */
    public function list(): array
    {
        $result = [];
        foreach ($this->stored() as $slug => $args) {
            $result[] = $this->export($slug, $args);
        }

        return $result;
    }

    /** @return array{slug: string, args: array<string, mixed>, revision: string}|null */
    public function get(string $slug): ?array
    {
        $stored = $this->stored();

        return isset($stored[$slug]) ? $this->export($slug, $stored[$slug]) : null;
    }

    /**
     * Creates or replaces one post type's arguments. With `$expectedRevision`, refused (#234)
     * unless the stored arguments still match it, same contract as MenuService::upsertMenu().
     *
     * @param array<string, mixed> $args
     * @return array{slug: string, args: array<string, mixed>, revision: string}
     */
    public function upsert(string $slug, array $args, ?string $expectedRevision = null): array
    {
        $this->assertValid($slug, $args);

        $stored = $this->stored();
        if ($expectedRevision !== null) {
            $current = isset($stored[$slug]) ? $this->revisionOf($stored[$slug]) : null;
            if ($current !== $expectedRevision) {
                $found = $current === null ? 'it no longer exists' : "its revision is now \"{$current}\"";
                // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML (see phpcs.xml.dist).
                throw new StalePostTypeRevisionException("Post type \"{$slug}\" changed on WordPress since it was last read (expected revision \"{$expectedRevision}\", but {$found}). Re-read it and try again.");
            }
        }

        $stored[$slug] = $args;
        $this->save($stored);

        return $this->export($slug, $args);
    }

    /** Never deletes the post type's posts: they stay in the database, hidden until it's registered again. */
    public function delete(string $slug): bool
    {
        $stored = $this->stored();
        if (!isset($stored[$slug])) {
            return false;
        }

        unset($stored[$slug]);
        $this->save($stored);

        return true;
    }

    /**
     * Registers every stored post type, skipping (never overwriting) a slug something else
     * already registered: the admin viewer reports it as a conflict. One broken entry never
     * stops the others.
     */
    public function register(): void
    {
        foreach ($this->stored() as $slug => $args) {
            // Re-validated: validated on write, but any other code can write this option too.
            try {
                $this->assertValid($slug, $args);
            } catch (InvalidPostTypeException) {
                continue;
            }

            $slug = strtolower($slug);
            if ($slug === '' || post_type_exists($slug)) {
                continue;
            }

            // Past assertValid(), the args shape is the user's file, checked by WordPress itself.
            // A WordPress-side error throws before anything is registered: skip that one entry
            // rather than take the whole site down on every request.
            try {
                $result = register_post_type($slug, $args);
            } catch (\Throwable) {
                continue;
            }

            if (!is_wp_error($result)) {
                $this->registered[$slug] = $result;
            }
        }
    }

    public function flushIfNeeded(): void
    {
        if (get_option(self::FLUSH_OPTION) === false) {
            return;
        }

        delete_option(self::FLUSH_OPTION);
        flush_rewrite_rules(false);
    }

    /**
     * Every post type a site owner would recognise as content (Loopress's, public ones, and any
     * with its own admin menu), with where it comes from, for the read-only admin viewer and
     * `lps cpt list`.
     *
     * @return list<array{slug: string, label: string, source: string, count: int, managed: bool, conflict: bool}>
     */
    public function registered(): array
    {
        $stored = $this->stored();
        $acf    = $this->acfSlugs();
        $cptui  = get_option('cptui_post_types');
        $cptui  = is_array($cptui) ? $cptui : [];

        $result = [];
        foreach (get_post_types([], 'objects') as $slug => $object) {
            // Same object, not just same slug: a theme or plugin registering this slug again later
            // in `init` silently replaces ours, which is then a conflict, not a Loopress type.
            $ours    = ($this->registered[$slug] ?? null) === $object;
            $visible = $object->public || ($object->show_ui && $object->show_in_menu && !$object->_builtin);
            if (!$ours && !$visible && !isset($stored[$slug])) {
                continue;
            }

            $source = match (true) {
                $ours => 'loopress',
                $object->_builtin => 'wordpress', // phpcs:ignore WordPress.WP.CapitalPDangit -- a source id, not prose.
                isset($acf[$slug]) => 'acf',
                isset($cptui[$slug]) => 'cptui',
                default => 'other',
            };

            $counts   = wp_count_posts($slug);
            $result[] = [
                'slug'     => $slug,
                'label'    => (string) $object->label,
                'source'   => $source,
                'count'    => (int) ($counts->publish ?? 0),
                'managed'  => isset($stored[$slug]),
                'conflict' => isset($stored[$slug]) && !$ours,
            ];
        }

        return $result;
    }

    /** @param array<string, mixed> $args */
    private function assertValid(string $slug, array $args): void
    {
        if (preg_match('/^[a-z0-9_-]{1,20}$/', $slug) !== 1) {
            // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML (see phpcs.xml.dist).
            throw new InvalidPostTypeException("Invalid post type slug \"{$slug}\": 1 to 20 lowercase letters, digits, \"_\" or \"-\".");
        }

        if (in_array($slug, self::RESERVED_SLUGS, true) || str_starts_with($slug, 'wp_')) {
            // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML (see phpcs.xml.dist).
            throw new InvalidPostTypeException("Post type slug \"{$slug}\" is reserved by WordPress.");
        }

        foreach (self::ARRAY_ARGS as $key => $alsoAllowed) {
            if (array_key_exists($key, $args) && !is_array($args[$key]) && !in_array($args[$key], $alsoAllowed, true)) {
                // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML (see phpcs.xml.dist).
                throw new InvalidPostTypeException("Post type \"{$slug}\": \"{$key}\" must be a JSON object or array" . ($alsoAllowed === [] ? '.' : ' (or ' . implode(', ', array_map(static fn(bool $value): string => $value ? 'true' : 'false', $alsoAllowed)) . ').'));
            }
        }

        $code = array_values(array_intersect(self::CODE_ARGS, array_keys($args)));
        if ($code !== []) {
            // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML (see phpcs.xml.dist).
            throw new InvalidPostTypeException("Post type \"{$slug}\": \"{$code[0]}\" runs PHP code, use a hook instead of a cpt/ file for it.");
        }
    }

    /** @return array<string, array<string, mixed>> */
    private function stored(): array
    {
        $stored = get_option(self::OPTION, []);

        /** @var array<string, array<string, mixed>> */
        return is_array($stored) ? $stored : [];
    }

    /** @param array<string, array<string, mixed>> $stored */
    private function save(array $stored): void
    {
        ksort($stored);
        update_option(self::OPTION, $stored, true);
        update_option(self::FLUSH_OPTION, 1, false);
    }

    /**
     * @param array<string, mixed> $args
     * @return array{slug: string, args: array<string, mixed>, revision: string}
     */
    private function export(string $slug, array $args): array
    {
        return ['slug' => $slug, 'args' => $args, 'revision' => $this->revisionOf($args)];
    }

    // sha256 for the same reason as OptionsService::revisionOf(): a change-detection tag only.
    /** @param array<string, mixed> $args */
    private function revisionOf(array $args): string
    {
        return hash('sha256', (string) wp_json_encode($args));
    }

    /** @return array<string, true> Slugs of the post types ACF (6.1+) registers from its own UI. */
    private function acfSlugs(): array
    {
        if (!function_exists('acf_get_acf_post_types')) {
            return [];
        }

        $slugs = [];
        foreach (acf_get_acf_post_types() as $postType) {
            if (is_array($postType) && is_string($postType['post_type'] ?? null)) {
                $slugs[$postType['post_type']] = true;
            }
        }

        return $slugs;
    }
}
