<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\AdminPage;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\AdminPage\Module\AdminPageModule;
use Loopress\Pushes\PushLog;
use PHPUnit\Framework\TestCase;
use WP_Admin_Bar;

class AdminPageModuleTest extends TestCase
{
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

        self::assertSame('https://site.test/wp-admin/admin.php?page=loopress', $bar->nodes['loopress']['href']);
        self::assertSame('Version: ' . LOOPRESS_VERSION, $bar->nodes['loopress-version']['title']);
        self::assertSame('Environment: staging', $bar->nodes['loopress-environment']['title']);
        self::assertSame('Last push: ACF, 5 mins ago', $bar->nodes['loopress-last-push']['title']);
    }

    public function test_admin_bar_is_hidden_from_non_admins(): void
    {
        Functions\when('current_user_can')->justReturn(false);
        $bar = new WP_Admin_Bar();

        (new AdminPageModule($this->createMock(PushLog::class)))->addAdminBarNode($bar);

        self::assertSame([], $bar->nodes);
    }
}
