<?php

namespace Loopress\Tests\Unit\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Service\PluginService;
use PHPUnit\Framework\TestCase;

class PluginServiceTest extends TestCase
{
    private PluginService $service;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->service = new PluginService();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    /** @param array<string, array<string, string>> $plugins */
    private function stubInstalledPlugins(array $plugins, array $active = []): void
    {
        Functions\when('get_plugins')->justReturn($plugins);
        Functions\when('get_option')->alias(
            fn(string $key, mixed $defaultValue = false) => $key === 'active_plugins' ? $active : $defaultValue,
        );
    }

    // ── getInstalled ─────────────────────────────────────────────────────────

    public function test_getInstalled_derives_slug_from_plugin_directory(): void
    {
        $this->stubInstalledPlugins([
            'woocommerce/woocommerce.php' => ['Name' => 'WooCommerce', 'Version' => '8.9.1'],
        ]);

        $result = $this->service->getInstalled();

        $this->assertSame('woocommerce', $result[0]['slug']);
        $this->assertSame('woocommerce/woocommerce.php', $result[0]['file']);
        $this->assertSame('8.9.1', $result[0]['version']);
    }

    public function test_getInstalled_derives_slug_from_single_file_plugin(): void
    {
        $this->stubInstalledPlugins([
            'hello.php' => ['Name' => 'Hello Dolly', 'Version' => '1.7.2'],
        ]);

        $result = $this->service->getInstalled();

        $this->assertSame('hello', $result[0]['slug']);
    }

    public function test_getInstalled_flags_active_plugins(): void
    {
        $this->stubInstalledPlugins(
            [
                'woocommerce/woocommerce.php' => ['Name' => 'WooCommerce', 'Version' => '8.9.1'],
                'akismet/akismet.php'         => ['Name' => 'Akismet', 'Version' => '5.3'],
            ],
            ['woocommerce/woocommerce.php'],
        );

        $result = $this->service->getInstalled();

        $this->assertTrue($result[0]['active']);
        $this->assertFalse($result[1]['active']);
    }

    // ── activate ─────────────────────────────────────────────────────────────

    public function test_activate_throws_when_plugin_is_not_installed(): void
    {
        $this->stubInstalledPlugins([]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Plugin "ghost" is not installed.');

        $this->service->activate('ghost');
    }

    public function test_activate_activates_the_matching_plugin_file(): void
    {
        $this->stubInstalledPlugins([
            'akismet/akismet.php' => ['Name' => 'Akismet', 'Version' => '5.3'],
        ]);
        Functions\when('is_wp_error')->alias(fn($thing) => $thing instanceof \WP_Error);
        Functions\expect('activate_plugin')->once()->with('akismet/akismet.php')->andReturn(null);

        $result = $this->service->activate('akismet');

        $this->assertSame('akismet activated successfully.', $result['message']);
    }

    public function test_activate_throws_when_wordpress_returns_an_error(): void
    {
        $this->stubInstalledPlugins([
            'akismet/akismet.php' => ['Name' => 'Akismet', 'Version' => '5.3'],
        ]);
        Functions\when('is_wp_error')->alias(fn($thing) => $thing instanceof \WP_Error);
        Functions\when('activate_plugin')->justReturn(new \WP_Error('plugin_error', 'Fatal error on activation.'));

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Fatal error on activation.');

        $this->service->activate('akismet');
    }

    // ── disableAutoUpdatesForManaged ─────────────────────────────────────────

    public function test_disableAutoUpdates_removes_only_managed_plugin_files(): void
    {
        Functions\when('get_plugins')->justReturn([
            'woocommerce/woocommerce.php' => ['Name' => 'WooCommerce', 'Version' => '8.9.1'],
            'akismet/akismet.php'         => ['Name' => 'Akismet', 'Version' => '5.3'],
        ]);
        Functions\when('get_option')->alias(fn(string $key, mixed $defaultValue = false) => match ($key) {
            'active_plugins'      => [],
            'auto_update_plugins' => ['woocommerce/woocommerce.php', 'akismet/akismet.php'],
            default               => $defaultValue,
        });

        Functions\expect('update_option')
            ->once()
            ->with('auto_update_plugins', ['akismet/akismet.php']);

        $this->service->disableAutoUpdatesForManaged(['woocommerce']);
        $this->addToAssertionCount(1);
    }

    public function test_disableAutoUpdates_keeps_list_unchanged_when_nothing_matches(): void
    {
        Functions\when('get_plugins')->justReturn([
            'akismet/akismet.php' => ['Name' => 'Akismet', 'Version' => '5.3'],
        ]);
        Functions\when('get_option')->alias(fn(string $key, mixed $defaultValue = false) => match ($key) {
            'active_plugins'      => [],
            'auto_update_plugins' => ['akismet/akismet.php'],
            default               => $defaultValue,
        });

        Functions\expect('update_option')
            ->once()
            ->with('auto_update_plugins', ['akismet/akismet.php']);

        $this->service->disableAutoUpdatesForManaged(['woocommerce']);
        $this->addToAssertionCount(1);
    }
}
