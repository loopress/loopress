<?php

namespace Loopress;

use Loopress\Infrastructure\ComposerRunner;
use Loopress\Infrastructure\LoopressEnvironment;
use Loopress\Infrastructure\PackagistClient;
use Loopress\RestApi\AcfController;
use Loopress\RestApi\CustomPostTypeController;
use Loopress\RestApi\PluginController;
use Loopress\RestApi\SettingsController;
use Loopress\RestApi\VendorController;
use Loopress\RestApi\WPCodeController;
use Loopress\Service\AcfService;
use Loopress\Service\CustomPostTypeService;
use Loopress\Service\PluginService;
use Loopress\Service\SettingsService;
use Loopress\Service\VendorService;
use Loopress\Service\WPCodeService;

class Plugin
{
    private LoopressEnvironment $dxEnv;
    private VendorService $vendorService;
    private SettingsService $settingsService;
    private CustomPostTypeService $cptService;
    private AcfService $acfService;
    private WPCodeService $wpCodeService;
    private PluginService $pluginService;
    private ?string $autoloadError = null;

    public function __construct()
    {
        $this->dxEnv           = new LoopressEnvironment();
        $this->settingsService = new SettingsService();
        $this->vendorService   = new VendorService(
            $this->dxEnv,
            new ComposerRunner($this->dxEnv),
            new PackagistClient(),
            $this->settingsService,
        );

        $this->cptService    = new CustomPostTypeService();
        $this->acfService    = new AcfService();
        $this->wpCodeService = new WPCodeService();
        $this->pluginService = new PluginService();

        $this->dxEnv->ensureInitialized();

        add_action('admin_menu', [$this, 'add_menu_page']);
        add_action('admin_head', [$this, 'add_menu_icon_style']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_admin_scripts']);
        add_action('rest_api_init', [$this, 'register_rest_routes']);
        add_filter('rest_post_dispatch', [$this, 'add_no_cache_headers'], 10, 3);
        add_action('litespeed_init', [$this, 'litespeed_no_cache_rest']);

        $autoload = $this->dxEnv->getAutoloadPath();
        if ($autoload) {
            try {
                ob_start();
                require_once $autoload;
                ob_end_clean();
            } catch (\RuntimeException $e) {
                ob_end_clean();
                $this->autoloadError = $e->getMessage();
            }
        }
    }

    public function register_rest_routes(): void
    {
        (new VendorController($this->vendorService))->register_routes();
        (new SettingsController($this->settingsService))->register_routes();
        (new CustomPostTypeController($this->cptService))->register_routes();
        (new AcfController($this->acfService))->register_routes();
        (new WPCodeController($this->wpCodeService))->register_routes();
        (new PluginController($this->pluginService))->register_routes();
    }

    public function add_menu_page(): void
    {
        add_menu_page(
            'Loopress',
            'Loopress',
            'manage_options',
            'loopress-plugin',
            [$this, 'render_admin_page'],
            LOOPRESS_PLUGIN_URL . 'assets/logo.svg',
            6
        );
    }

    public function add_menu_icon_style(): void
    {
        echo '<style>#toplevel_page_loopress-plugin .wp-menu-image img { width: 26px; height: 100%; padding: 0; vertical-align: middle }</style>';
    }

    public function enqueue_admin_scripts(string $hook): void
    {
        if ($hook !== 'toplevel_page_loopress-plugin') {
            return;
        }

        $asset_file = LOOPRESS_PLUGIN_PATH . 'build/index.asset.php';
        $asset = file_exists($asset_file)
            ? require $asset_file
            : ['dependencies' => [], 'version' => '1.0.0'];

        wp_enqueue_script(
            'loopress-plugin-admin',
            LOOPRESS_PLUGIN_URL . 'build/index.tsx.js',
            $asset['dependencies'],
            $asset['version'],
            true
        );

        wp_enqueue_style('wp-components');

        wp_localize_script('loopress-plugin-admin', 'loopressData', [
            'apiUrl'        => get_rest_url(null, 'loopress/v1'),
            'nonce'         => wp_create_nonce('wp_rest'),
            'autoloadError' => $this->autoloadError,
            'phpVersion'    => PHP_VERSION,
        ]);
    }

    public function render_admin_page(): void
    {
        echo '<div id="loopress-admin-root"></div>';
    }

    public function litespeed_no_cache_rest(): void
    {
        $uri = isset($_SERVER['REQUEST_URI']) ? sanitize_text_field(wp_unslash($_SERVER['REQUEST_URI'])) : '';
        if (str_contains($uri, '/wp-json/loopress/')) {
            // Tell LSCWP not to store this response in LiteSpeed's server-side cache.
            do_action('litespeed_control_set_nocache', 'loopress REST API');
        }
    }

    public function add_no_cache_headers(\WP_REST_Response $response, \WP_REST_Server $_server, \WP_REST_Request $request): \WP_REST_Response
    {
        if (str_starts_with($request->get_route(), '/loopress/v1')) {
            $response->header('X-LiteSpeed-Cache-Control', 'no-cache');
            $response->header('Cache-Control', 'no-store, no-cache, must-revalidate');
            $response->header('Pragma', 'no-cache');
        }

        return $response;
    }
}
