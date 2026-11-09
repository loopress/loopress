<?php

declare(strict_types=1);

namespace Loopress\SiteReport\Service;

use Loopress\Infrastructure\Narrow;

/**
 * Builds the body of POST /site-reports from what WordPress already knows: the update
 * transients (the plugin never triggers an update check) and the stored Site Health result
 * (the plugin never runs the tests). Never content, users, emails, options or plugin settings.
 */
class ReportPayload
{
    public const MAX_PLUGINS = 500;

    /** @return array<string, mixed> */
    public function build(): array
    {
        if (!function_exists('get_plugins') && defined('ABSPATH')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        return [
            'url'        => home_url(),
            'wordpress'  => (string) get_bloginfo('version'),
            'php'        => PHP_VERSION,
            'loopress'   => LOOPRESS_VERSION,
            'coreUpdate' => $this->coreUpdate(),
            'theme'      => $this->theme(),
            'plugins'    => $this->plugins(),
            'siteHealth' => $this->siteHealth(),
        ];
    }

    private function coreUpdate(): ?string
    {
        $transient = get_site_transient('update_core');
        if (!is_object($transient) || !isset($transient->updates) || !is_array($transient->updates)) {
            return null;
        }

        foreach ($transient->updates as $update) {
            $update = Narrow::map(is_object($update) ? get_object_vars($update) : $update);
            $current = Narrow::string($update['current'] ?? '');
            if (($update['response'] ?? null) === 'upgrade' && $current !== '') {
                return $current;
            }
        }

        return null;
    }

    /** @return array{slug: string, version: string, update: ?string} */
    private function theme(): array
    {
        $theme = wp_get_theme();
        $slug  = $theme->get_stylesheet();

        return [
            'slug'    => $slug,
            'version' => (string) $theme->get('Version'),
            'update'  => $this->newVersion(get_site_transient('update_themes'), $slug),
        ];
    }

    /** @return list<array{slug: string, version: string, active: bool, update: ?string}> */
    private function plugins(): array
    {
        $updates = get_site_transient('update_plugins');
        $plugins = [];

        foreach (get_plugins() as $file => $data) {
            if (count($plugins) >= self::MAX_PLUGINS) {
                break;
            }
            $file      = (string) $file;
            $plugins[] = [
                'slug'    => self::slug($file),
                'version' => Narrow::string(Narrow::map($data)['Version'] ?? ''),
                'active'  => is_plugin_active($file),
                'update'  => $this->newVersion($updates, $file),
            ];
        }

        return $plugins;
    }

    /** The plugin's directory, or the file name without `.php` for a single-file plugin. */
    public static function slug(string $file): string
    {
        $dir = dirname($file);

        return $dir === '.' ? basename($file, '.php') : $dir;
    }

    /**
     * `response` of the update_plugins (objects) or update_themes (arrays) transient,
     * keyed by plugin file or theme stylesheet.
     */
    private function newVersion(mixed $transient, string $key): ?string
    {
        if (!is_object($transient) || !isset($transient->response) || !is_array($transient->response)) {
            return null;
        }
        $entry   = $transient->response[$key] ?? null;
        $version = Narrow::string(Narrow::map(is_object($entry) ? get_object_vars($entry) : $entry)['new_version'] ?? '');

        return $version !== '' ? $version : null;
    }

    /** @return ?array{good: int, recommended: int, critical: int} */
    private function siteHealth(): ?array
    {
        $stored = get_transient('health-check-site-status-result');
        $counts = is_string($stored) ? json_decode($stored, true) : null;
        if (!is_array($counts)) {
            return null;
        }

        return [
            'good'        => Narrow::int($counts['good'] ?? 0),
            'recommended' => Narrow::int($counts['recommended'] ?? 0),
            'critical'    => Narrow::int($counts['critical'] ?? 0),
        ];
    }
}
