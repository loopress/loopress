<?php

declare(strict_types=1);

namespace Loopress\Pushes;

use WP_REST_Request;

/**
 * What the CLI pushed to this site, and whether it changed since. The CLI reports each
 * successful `lps <resource> push` once, at the end (see the CLI's PushCommand): one entry per
 * command, not per HTTP request, since a single `lps acf push` sends one request per field group.
 *
 * Drift detection fingerprints the same Loopress REST routes the CLI reads its state from, right
 * after the push and again on demand: any difference means the resource changed outside the CLI
 * (wp-admin, WP-CLI, another plugin), whatever the path, without listening to one WordPress hook
 * per resource. A resource with no reliable route (option values, theme styles, which live in
 * WordPress core) has no fingerprint and reports drift as unknown.
 */
class PushLog
{
    public const OPTION = 'loopress_push_log';

    private const MAX_ENTRIES = 50;

    public const RESOURCES_FILTER = 'loopress_push_resources';

    /**
     * CLI command id => what to show, which GET routes (under loopress/v1) describe it, and which
     * admin screens edit it (substrings of the screen id). Only these ids are accepted, so a client
     * cannot fill the log with arbitrary labels. Loopress Full's modules add their own resources
     * through RESOURCES_FILTER, so this shared list never names a Full-only feature.
     */
    private const RESOURCES = [
        'acf:push'         => [
            'label'   => 'ACF',
            'routes'  => ['/acf/field-groups', '/acf/post-types', '/acf/taxonomies', '/acf/options-pages'],
            'screens' => ['acf-field-group', 'acf-post-type', 'acf-taxonomy', 'acf-ui-options-page'],
        ],
        'seo:push'         => ['label' => 'SEO settings and redirects', 'routes' => ['/seo/settings', '/seo/redirects']],
        'menu:push'        => ['label' => 'Menus', 'routes' => ['/menus', '/menu-locations'], 'screens' => ['nav-menus']],
        // Option values have no list route to fingerprint (GET /options lists names only).
        'option:push'      => ['label' => 'Options', 'routes' => []],
        'form:push'        => ['label' => 'Forms', 'routes' => ['/forms'], 'screens' => ['wpforms']],
        // Theme styles go through WordPress core's own REST API, nothing Loopress can fingerprint.
        'theme:style:push' => ['label' => 'Theme styles', 'routes' => []],
    ];

    /** @return array<string, array{label: string, routes: list<string>, screens?: list<string>}> */
    public static function resources(): array
    {
        /** @var array<string, array{label: string, routes: list<string>, screens?: list<string>}> */
        return apply_filters(self::RESOURCES_FILTER, self::RESOURCES);
    }

    /** The push command owning an admin screen, null when no pushed resource is edited there. */
    public static function resourceForScreen(string $screenId): ?string
    {
        foreach (self::resources() as $resource => $definition) {
            foreach ($definition['screens'] ?? [] as $needle) {
                if (str_contains($screenId, $needle)) {
                    return $resource;
                }
            }
        }

        return null;
    }

    /** @return array{resource: string, label: string, at: string, user: string, appPassword: ?string} */
    public function record(string $command): array
    {
        $entry = [
            'resource'    => $command,
            'label'       => self::resources()[$command]['label'],
            'at'          => gmdate('c'),
            'user'        => wp_get_current_user()->display_name,
            'appPassword' => $this->appPasswordName(),
        ];

        $log = $this->read();
        array_unshift($log['entries'], $entry);
        $log['entries'] = array_slice($log['entries'], 0, self::MAX_ENTRIES);

        $fingerprint = $this->fingerprint($command);
        if ($fingerprint !== null) {
            $log['fingerprints'][$command] = $fingerprint;
        }

        update_option(self::OPTION, $log, false);

        return $entry;
    }

    /**
     * Most recent push first, plus each pushed resource's latest push and drift status: true
     * when it changed since that push, false when it did not, null when it can't be told.
     *
     * @return array{entries: list<array<string, mixed>>, resources: list<array<string, mixed>>}
     */
    public function summary(): array
    {
        $log         = $this->read();
        $definitions = self::resources();
        $resources   = [];

        foreach ($log['entries'] as $entry) {
            $resource = $entry['resource'];
            if (isset($resources[$resource]) || !isset($definitions[$resource])) {
                continue;
            }

            $stored = $log['fingerprints'][$resource] ?? null;
            $now    = $stored === null ? null : $this->fingerprint($resource);

            $resources[$resource] = [
                'resource' => $resource,
                'label'    => $definitions[$resource]['label'],
                'command'  => 'lps ' . str_replace(':', ' ', $resource),
                'lastPush' => $entry,
                'drift'    => $now === null ? null : $now !== $stored,
            ];
        }

        return ['entries' => $log['entries'], 'resources' => array_values($resources)];
    }

    /** @return array<string, mixed>|null The latest push of $command, null when never pushed. */
    public function lastPush(string $command): ?array
    {
        foreach ($this->read()['entries'] as $entry) {
            if ($entry['resource'] === $command) {
                return $entry;
            }
        }

        return null;
    }

    private function fingerprint(string $command): ?string
    {
        $routes = self::resources()[$command]['routes'] ?? [];
        if ($routes === []) {
            return null;
        }

        // The same responses the CLI reads, errors included: a route answering the same error
        // twice (no SEO plugin active, say) is stable, one that starts or stops failing is a change.
        $data = array_map(
            static fn(string $route): mixed => rest_do_request(new WP_REST_Request('GET', '/loopress/v1' . $route))->get_data(),
            $routes,
        );

        return md5((string) wp_json_encode($data));
    }

    // The name the admin gave the application password this push authenticated with, so the
    // log tells "CI" from "office laptop" even when both use the same WordPress account.
    private function appPasswordName(): ?string
    {
        $uuid = rest_get_authenticated_app_password();
        if (!is_string($uuid) || $uuid === '') {
            return null;
        }

        $password = \WP_Application_Passwords::get_user_application_password(get_current_user_id(), $uuid);

        return is_array($password) ? $password['name'] : null;
    }

    /** @return array{entries: list<array{resource: string, label: string, at: string, user: string, appPassword: ?string}>, fingerprints: array<string, string>} */
    private function read(): array
    {
        $log = get_option(self::OPTION, []);

        return [
            'entries'      => is_array($log) && is_array($log['entries'] ?? null) ? array_values($log['entries']) : [],
            'fingerprints' => is_array($log) && is_array($log['fingerprints'] ?? null) ? $log['fingerprints'] : [],
        ];
    }
}
