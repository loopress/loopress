<?php

declare(strict_types=1);

namespace Loopress\Update\Infrastructure;

use stdClass;

/**
 * Wires GithubReleaseChecker into WordPress's own plugin-update machinery, the same one
 * wordpress.org-hosted plugins use: pre_set_site_transient_update_plugins advertises the
 * update on the Plugins page (and to the bulk updater, WP-CLI, and auto-updates), and
 * plugins_api backs the "View version x.y.z details" thickbox. From there WordPress
 * downloads and installs loopress-full.zip through its own Plugin_Upgrader, no custom
 * download/unzip code needed here.
 *
 * This only works because loopress.php's Full build carries an `Update URI` header
 * pointing away from wordpress.org (see build-flavor.cjs): since WP 5.8, that header is
 * what tells wp_update_plugins() to skip its own wordpress.org lookup for this plugin and
 * leave the transient's entry for a third party (this class) to fill in instead.
 */
class PluginUpdater
{
    private const PLUGIN_URI = 'https://github.com/loopress/loopress';
    private const HOMEPAGE = 'https://loopress.dev';

    public function __construct(private GithubReleaseChecker $checker)
    {
    }

    public function register(): void
    {
        add_filter('pre_set_site_transient_update_plugins', [$this, 'injectUpdate']);
        add_filter('plugins_api', [$this, 'pluginInformation'], 10, 3);
    }

    public function injectUpdate(mixed $transient): mixed
    {
        if (!is_object($transient)) {
            return $transient;
        }
        if (!isset($transient->response) || !is_array($transient->response)) {
            $transient->response = [];
        }
        if (!isset($transient->no_update) || !is_array($transient->no_update)) {
            $transient->no_update = [];
        }

        $basename = $this->pluginBasename();
        $latest   = $this->checker->getLatestVersion();

        if ($latest === null || !version_compare($latest, LOOPRESS_VERSION, '>')) {
            $transient->no_update[$basename] = $this->pluginItem(LOOPRESS_VERSION);

            return $transient;
        }

        $package = $this->checker->getLatestDownloadUrl();
        if ($package === null) {
            // A newer tag exists but its zip asset isn't attached yet (release still being
            // assembled by CI); skip this plugin for this cycle rather than claim either state.
            return $transient;
        }

        $transient->response[$basename] = $this->pluginItem($latest, $package);

        return $transient;
    }

    public function pluginInformation(mixed $result, string $action, mixed $args): mixed
    {
        if ($action !== 'plugin_information' || !is_object($args) || ($args->slug ?? null) !== $this->pluginSlug()) {
            return $result;
        }

        $info              = new stdClass();
        $info->name        = 'Loopress Full';
        $info->slug        = $this->pluginSlug();
        $info->version     = $this->checker->getLatestVersion() ?? LOOPRESS_VERSION;
        $info->homepage    = self::HOMEPAGE;
        $info->sections    = [
            'description' => 'Loopress Full is distributed from GitHub Releases, not wordpress.org.',
        ];
        $info->download_link = $this->checker->getLatestDownloadUrl() ?? '';

        return $info;
    }

    private function pluginItem(string $version, ?string $package = null): stdClass
    {
        $item              = new stdClass();
        $item->id          = self::PLUGIN_URI;
        $item->slug        = $this->pluginSlug();
        $item->plugin      = $this->pluginBasename();
        $item->new_version = $version;
        $item->url         = self::HOMEPAGE;
        $item->package     = $package ?? '';
        $item->icons       = [];
        $item->banners     = [];

        return $item;
    }

    private function pluginSlug(): string
    {
        return LOOPRESS_PLUGIN_SLUG;
    }

    // loopress.php is always the entry file's basename in both editions (build-flavor.cjs
    // only ever changes the containing folder, never the filename), so the plugin basename
    // WordPress keys its update transient by never needs a live plugin_basename() lookup.
    private function pluginBasename(): string
    {
        return LOOPRESS_PLUGIN_SLUG . '/loopress.php';
    }
}
