<?php

namespace Loopress\Module;

use Loopress\Contract\Module;

class AdminPageModule implements Module
{
    public function __construct(private ?string $autoloadError) {}

    public function boot(): void
    {
        add_action('admin_menu', [$this, 'addMenuPage']);
        add_action('admin_head', [$this, 'addMenuIconStyle']);
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
            6
        );
    }

    public function addMenuIconStyle(): void
    {
        echo '<style>#toplevel_page_loopress .wp-menu-image img { width: 26px; height: 100%; padding: 0; vertical-align: middle }</style>';
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

        $pluginData = get_file_data(LOOPRESS_PLUGIN_PATH . 'loopress.php', ['Version' => 'Version']);

        wp_localize_script('loopress-admin', 'loopressData', [
            'apiUrl'        => get_rest_url(null, 'loopress/v1'),
            'nonce'         => wp_create_nonce('wp_rest'),
            'autoloadError' => $this->autoloadError,
            'phpVersion'    => PHP_VERSION,
            'pluginVersion' => $pluginData['Version'],
        ]);
    }

    public function renderPage(): void
    {
        echo '<div id="loopress-admin-root"></div>';
    }
}
