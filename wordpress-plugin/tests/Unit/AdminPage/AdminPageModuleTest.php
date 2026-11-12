<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\AdminPage;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\AdminPage\Module\AdminPageModule;
use Loopress\Pushes\PushLog;
use PHPUnit\Framework\TestCase;
use WP_Admin_Bar;
use Loopress\Tests\Unit\DigsIntoArrays;

class AdminPageModuleTest extends TestCase
{
    use DigsIntoArrays;

    /** @var list<string> */
    private array $scripts = [];

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        Functions\when('current_user_can')->justReturn(true);
        Functions\when('admin_url')->alias(static fn (string $path): string => "https://site.test/wp-admin/{$path}");
        Functions\when('wp_get_environment_type')->justReturn('staging');
        Functions\when('human_time_diff')->justReturn('5 mins');
        Functions\when('esc_url')->returnArg();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_admin_bar_links_to_loopress_and_shows_site_state_on_hover(): void
    {
        $log = $this->createMock(PushLog::class);
        $log->method('lastPush')->willReturn(['label' => 'ACF', 'at' => '2026-10-20T10:00:00+00:00']);
        $bar = new WP_Admin_Bar();

        (new AdminPageModule($log))->addAdminBarNode($bar);

        self::assertSame('https://site.test/wp-admin/admin.php?page=loopress', self::at($bar->nodes, 'loopress', 'href'));
        self::assertSame('Version: ' . LOOPRESS_VERSION, self::at($bar->nodes, 'loopress-version', 'title'));
        self::assertSame('Environment: staging', self::at($bar->nodes, 'loopress-environment', 'title'));
        self::assertSame('Last push: ACF, 5 mins ago', self::at($bar->nodes, 'loopress-last-push', 'title'));
    }

    public function test_admin_bar_is_hidden_from_non_admins(): void
    {
        Functions\when('current_user_can')->justReturn(false);
        $bar = new WP_Admin_Bar();

        (new AdminPageModule($this->createMock(PushLog::class)))->addAdminBarNode($bar);

        self::assertSame([], $bar->nodes);
    }

    public function test_boot_hooks_the_menu_the_admin_bar_and_the_scripts(): void
    {
        (new AdminPageModule($this->createMock(PushLog::class)))->boot();

        self::assertNotFalse(has_action('admin_menu'));
        self::assertNotFalse(has_action('admin_bar_menu'));
        self::assertNotFalse(has_action('admin_enqueue_scripts'));
    }

    public function test_the_menu_entry_is_for_admins_and_renders_the_react_root(): void
    {
        $page = null;
        Functions\when('add_menu_page')->alias(static function (string $title, string $menu, string $cap, string $slug, callable $render) use (&$page): void {
            $page = [$cap, $slug, $render];
        });
        $module = new AdminPageModule($this->createMock(PushLog::class));

        $module->addMenuPage();

        self::assertNotNull($page);
        self::assertSame(['manage_options', 'loopress'], [$page[0], $page[1]]);
        ob_start();
        $page[2]();
        self::assertSame('<div id="loopress-admin-root"></div>', ob_get_clean());
    }

    public function test_the_menu_icon_style_is_registered_and_enqueued(): void
    {
        $calls = [];
        Functions\when('wp_register_style')->alias(static function (string $handle) use (&$calls): void {
            $calls[] = "register {$handle}";
        });
        Functions\when('wp_enqueue_style')->alias(static function (string $handle) use (&$calls): void {
            $calls[] = "enqueue {$handle}";
        });
        Functions\when('wp_add_inline_style')->alias(static function (string $handle) use (&$calls): void {
            $calls[] = "css {$handle}";
        });

        (new AdminPageModule($this->createMock(PushLog::class)))->enqueueMenuIconStyle();

        self::assertSame(['register loopress-admin-icon', 'enqueue loopress-admin-icon', 'css loopress-admin-icon'], $calls);
    }

    public function test_the_app_script_loads_only_on_the_loopress_page_with_the_site_data(): void
    {
        /** @var array{string, string, array<string, mixed>}|null $data */
        $data    = null;
        Functions\when('wp_enqueue_script')->alias(function (string $handle): void {
            $this->scripts[] = $handle;
        });
        Functions\when('wp_enqueue_style')->justReturn(null);
        Functions\when('wp_add_inline_style')->justReturn(null);
        Functions\when('get_file_data')->justReturn(['Version' => '2026.1.0']);
        Functions\when('apply_filters')->alias(static fn(string $hook, mixed $value = null): mixed => $value);
        Functions\when('get_rest_url')->alias(static fn(?int $blog = null, string $path = ''): string => 'https://site.test/wp-json/' . $path);
        Functions\when('wp_create_nonce')->justReturn('nonce');
        Functions\when('home_url')->justReturn('https://site.test');
        Functions\when('wp_localize_script')->alias(static function (string $handle, string $name, array $payload) use (&$data): void {
            $data = [$handle, $name, $payload];
        });
        $module = new AdminPageModule($this->createMock(PushLog::class));

        $module->enqueueScripts('edit.php');
        self::assertSame([], $this->scripts);

        $module->enqueueScripts('toplevel_page_loopress');
        self::assertSame(['loopress-admin'], $this->scripts);
        self::assertNotNull($data);
        self::assertSame(['loopress-admin', 'loopressData'], [$data[0], $data[1]]);
        self::assertSame('https://site.test/wp-json/loopress/v1', self::at($data, 2, 'apiUrl'));
        self::assertSame('nonce', self::at($data, 2, 'nonce'));
        self::assertSame('2026.1.0', self::at($data, 2, 'pluginVersion'));
        self::assertSame('staging', self::at($data, 2, 'environment'));
    }
}
