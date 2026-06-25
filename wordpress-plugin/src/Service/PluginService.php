<?php

namespace Loopress\Service;

class PluginService
{
    public function getInstalled(): array
    {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        $plugins = get_plugins();
        $active  = get_option('active_plugins', []);
        $result  = [];

        foreach ($plugins as $file => $data) {
            $slug     = $this->slugFromFile($file);
            $result[] = [
                'slug'    => $slug,
                'file'    => $file,
                'name'    => $data['Name'],
                'version' => $data['Version'],
                'active'  => in_array($file, $active, true),
            ];
        }

        return $result;
    }

    public function activate(string $slug): array
    {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        $file = $this->findInstalledFile($slug);
        if ($file === null) {
            throw new \RuntimeException("Plugin \"{$slug}\" is not installed.");
        }

        $result = activate_plugin($file);
        if (is_wp_error($result)) {
            throw new \RuntimeException($result->get_error_message());
        }

        return ['message' => "{$slug} activated successfully."];
    }

    public function install(string $slug, string $version): array
    {
        $this->requireUpgraderIncludes();

        $downloadUrl = $this->resolveDownloadUrl($slug, $version);
        $skin        = new \WP_Ajax_Upgrader_Skin();
        $upgrader    = new \Plugin_Upgrader($skin);

        $installedFile = $this->findInstalledFile($slug);

        if ($installedFile !== null) {
            $currentVersion = $this->getInstalledVersion($installedFile);
            if ($currentVersion === $version) {
                return ['message' => "{$slug} is already at version {$version}.", 'version' => $version];
            }

            // Download zip and upgrade in-place using the specific version URL.
            $result = $upgrader->install($downloadUrl, ['overwrite_package' => true]);
        } else {
            $result = $upgrader->install($downloadUrl);
        }

        if (is_wp_error($result)) {
            throw new \RuntimeException($result->get_error_message());
        }

        if ($result === false) {
            $errors = $skin->get_upgrade_messages();
            throw new \RuntimeException(implode(' ', $errors) ?: 'Installation failed for unknown reason.');
        }

        $this->disableAutoUpdate($slug);

        return ['message' => "{$slug} {$version} installed successfully.", 'version' => $version];
    }

    /**
     * @param string[] $slugs
     */
    public function disableAutoUpdatesForManaged(array $slugs): void
    {
        $autoUpdates = get_option('auto_update_plugins', []);
        $installed   = $this->getInstalled();

        $managedFiles = [];
        foreach ($installed as $plugin) {
            if (in_array($plugin['slug'], $slugs, true)) {
                $managedFiles[] = $plugin['file'];
            }
        }

        $autoUpdates = array_values(array_diff($autoUpdates, $managedFiles));
        update_option('auto_update_plugins', $autoUpdates);
    }

    private function disableAutoUpdate(string $slug): void
    {
        $installed = $this->getInstalled();
        foreach ($installed as $plugin) {
            if ($plugin['slug'] === $slug) {
                $this->disableAutoUpdatesForManaged([$slug]);
                return;
            }
        }
    }

    private function resolveDownloadUrl(string $slug, string $version): string
    {
        if ($version === 'latest') {
            return "https://downloads.wordpress.org/plugin/{$slug}.zip";
        }

        return "https://downloads.wordpress.org/plugin/{$slug}.{$version}.zip";
    }

    private function findInstalledFile(string $slug): ?string
    {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        foreach (get_plugins() as $file => $data) {
            if ($this->slugFromFile($file) === $slug) {
                return $file;
            }
        }

        return null;
    }

    private function getInstalledVersion(string $pluginFile): string
    {
        $plugins = get_plugins();
        return $plugins[$pluginFile]['Version'] ?? '';
    }

    private function slugFromFile(string $file): string
    {
        // e.g. "woocommerce/woocommerce.php" → "woocommerce"
        // e.g. "hello.php" → "hello"
        $parts = explode('/', $file);
        return count($parts) > 1 ? $parts[0] : pathinfo($file, PATHINFO_FILENAME);
    }

    private function requireUpgraderIncludes(): void
    {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        if (!class_exists('WP_Upgrader')) {
            require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
        }

        if (!class_exists('Plugin_Upgrader')) {
            require_once ABSPATH . 'wp-admin/includes/class-plugin-upgrader.php';
        }

        if (!function_exists('request_filesystem_credentials')) {
            require_once ABSPATH . 'wp-admin/includes/file.php';
        }

        // Initialize WP_Filesystem (required by Plugin_Upgrader).
        if (!function_exists('WP_Filesystem')) {
            require_once ABSPATH . 'wp-admin/includes/file.php';
        }

        WP_Filesystem();
    }
}
