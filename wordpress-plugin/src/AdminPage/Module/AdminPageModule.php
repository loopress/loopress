<?php

declare(strict_types=1);

namespace Loopress\AdminPage\Module;

use Loopress\Contract\Module;

class AdminPageModule implements Module
{
    public function boot(): void
    {
        add_action('admin_menu', [$this, 'addMenuPage']);
        // Fires on every admin screen, unlike enqueueScripts below, because the menu
        // icon it styles sits in the sidebar that's present on every admin screen.
        add_action('admin_enqueue_scripts', [$this, 'enqueueMenuIconStyle']);
        add_action('admin_enqueue_scripts', [$this, 'enqueueScripts']);
    }

    public function addMenuPage(): void
    {
        add_menu_page(
            'Loopress',
            'Loopress',
            'manage_options',
            'loopress',
            [$this, 'renderPage'],
            LOOPRESS_PLUGIN_URL . 'assets/logo.svg',
            100
        );
    }

    public function enqueueMenuIconStyle(): void
    {
        wp_register_style('loopress-admin-icon', false, [], LOOPRESS_VERSION);
        wp_enqueue_style('loopress-admin-icon');
        wp_add_inline_style(
            'loopress-admin-icon',
            '#toplevel_page_loopress .wp-menu-image img { width: 26px; height: 100%; padding: 0; vertical-align: middle }'
        );
    }

    public function enqueueScripts(string $hook): void
    {
        if ($hook !== 'toplevel_page_loopress') {
            return;
        }

        $assetFile = LOOPRESS_PLUGIN_PATH . 'build/index.tsx.asset.php';
        $asset     = file_exists($assetFile)
            ? require_once $assetFile
            : ['dependencies' => [], 'version' => '1.0.0'];

        wp_enqueue_script(
            'loopress-admin',
            LOOPRESS_PLUGIN_URL . 'build/index.tsx.js',
            $asset['dependencies'],
            $asset['version'],
            true
        );

        wp_enqueue_style('wp-components');
        // #wpcontent's left padding is wp-admin core chrome, not ours to edit directly;
        // this page's own layout (Page component) already handles its own spacing.
        wp_add_inline_style('wp-components', '#wpcontent { padding-left: 0; }');

        $pluginData = get_file_data(LOOPRESS_PLUGIN_PATH . 'loopress.php', ['Version' => 'Version']);

        // Extended through this filter by optional feature modules, which report their
        // own health data (the Plus edition's autoload status today) without this shared
        // code ever referencing them directly.
        wp_localize_script('loopress-admin', 'loopressData', apply_filters('loopress_admin_data', [
            'apiUrl'        => get_rest_url(null, 'loopress/v1'),
            'nonce'         => wp_create_nonce('wp_rest'),
            'phpVersion'    => PHP_VERSION,
            'pluginVersion' => $pluginData['Version'],
            'autoloadError' => null,
        ]));
    }

    public function renderPage(): void
    {
        echo '<div id="loopress-admin-root"></div>';
    }
}
