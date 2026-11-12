<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Pushes\Module;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Pushes\Module\PushesModule;
use Loopress\Pushes\PushLog;
use Loopress\Pushes\RestApi\PushesController;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class PushesModuleTest extends TestCase
{
    private PushLog&MockObject $log;
    private PushesModule $module;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        Functions\when('apply_filters')->alias(static fn(string $hook, mixed $value = null): mixed => $value);
        Functions\when('human_time_diff')->justReturn('2 hours');
        $this->log    = $this->createMock(PushLog::class);
        $this->module = new PushesModule(new PushesController($this->log), $this->log);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    private function onScreen(?string $id): void
    {
        Functions\when('get_current_screen')->justReturn($id === null ? null : (object) ['id' => $id]);
    }

    public function test_boot_registers_the_routes_and_the_managed_notice(): void
    {
        $this->module->boot();

        $this->assertNotFalse(has_action('rest_api_init'));
        $this->assertNotFalse(has_action('admin_notices'));
    }

    public function test_a_pushed_resource_screen_warns_that_edits_are_overwritten(): void
    {
        $this->onScreen('nav-menus');
        $this->log->method('lastPush')->with('menu:push')->willReturn(['resource' => 'menu:push', 'label' => 'Menus', 'at' => '2026-01-01T00:00:00+00:00', 'user' => 'admin', 'appPassword' => null]);

        ob_start();
        $this->module->renderManagedNotice();
        $html = (string) ob_get_clean();

        $this->assertStringContainsString('notice-warning', $html);
        $this->assertStringContainsString('Managed by Loopress.', $html);
        $this->assertStringContainsString('Last pushed 2 hours ago with &quot;lps menu push&quot;.', $html);
    }

    public function test_no_notice_without_a_screen_a_managed_screen_or_a_push(): void
    {
        $this->log->method('lastPush')->willReturn(null);

        foreach ([null, 'dashboard', 'nav-menus'] as $screen) {
            $this->onScreen($screen);
            ob_start();
            $this->module->renderManagedNotice();
            $this->assertSame('', ob_get_clean(), (string) $screen);
        }
    }
}
