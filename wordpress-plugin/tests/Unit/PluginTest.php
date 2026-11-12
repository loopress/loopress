<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Contract\FeatureProvider;
use Loopress\Plugin;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Filesystem\Filesystem;

class PluginTest extends TestCase
{
    use CapturesRoutes;
    use RecordsHooks;

    private const FULL_FEATURES = ['Sentry', 'Dependencies', 'Update', 'Api', 'Hooks', 'Blocks', 'Apps', 'Settings', 'Pages', 'TempAdmin', 'SiteReport'];

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        if (!defined('WP_CONTENT_DIR')) {
            define('WP_CONTENT_DIR', sys_get_temp_dir() . '/loopress-plugin-test-' . getmypid());
        }

        // What loopress.php does for the Full edition.
        Functions\when('apply_filters')->alias(static function (string $hook, mixed $value = null): mixed {
            foreach (PluginTest::FULL_FEATURES as $feature) {
                /** @var class-string<FeatureProvider> $class */
                $class = "\\Loopress\\{$feature}\\Feature";
                if ($hook === 'loopress_feature_definitions') {
                    $value = array_merge((array) $value, $class::definitions());
                } elseif ($hook === 'loopress_module_classes') {
                    $value = array_merge((array) $value, $class::moduleClasses());
                }
            }

            return $value;
        });
        Functions\stubTranslationFunctions();
        Functions\when('plugin_dir_path')->justReturn('/tmp/loopress/');
        Functions\when('plugin_basename')->justReturn('loopress/loopress.php');
        Functions\when('is_admin')->justReturn(false);
        Functions\when('get_option')->justReturn(false);
        Functions\when('wp_get_environment_type')->justReturn('production');
        Functions\when('wp_upload_dir')->justReturn(['basedir' => '/tmp/loopress-uploads', 'baseurl' => 'https://site.test/uploads']);
        Functions\when('wp_get_upload_dir')->justReturn(['basedir' => '/tmp/loopress-uploads', 'baseurl' => 'https://site.test/uploads']);
        Functions\when('get_template_directory')->justReturn('/tmp/theme');
        Functions\when('get_stylesheet_directory')->justReturn('/tmp/theme');
        Functions\when('get_theme_root')->justReturn('/tmp');
        Functions\when('content_url')->justReturn('https://site.test/wp-content');
        Functions\when('add_shortcode')->justReturn(null);
        Functions\when('update_option')->justReturn(true);
        Functions\when('delete_option')->justReturn(true);
        Functions\when('register_activation_hook')->justReturn(null);
        Functions\when('register_deactivation_hook')->justReturn(null);
    }

    protected function tearDown(): void
    {
        (new Filesystem())->remove(WP_CONTENT_DIR . '/loopress');
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_every_feature_resolves_and_boots_and_hooks_into_wordpress(): void
    {
        $plugin = new Plugin(); // the constructor resolves and boots every module
        unset($plugin);

        $this->assertNotFalse(has_action('rest_api_init'));
        $this->assertNotFalse(has_action('admin_menu'));
    }

    public function test_the_rest_routes_of_every_module_are_registered_on_rest_api_init(): void
    {
        $this->captureRoutes();
        $this->recordActions('rest_api_init');
        $plugin = new Plugin(); // the constructor resolves and boots every module
        unset($plugin);

        $this->fireAction('rest_api_init');

        $registered = $this->registered();
        foreach (['GET /menus', 'GET /content', 'GET /pushes', 'GET /update', 'GET /apps', 'GET /api-namespace', 'GET /block-files'] as $route) {
            $this->assertContains($route, $registered);
        }
    }
}
