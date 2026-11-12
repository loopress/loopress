<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Apps\Module;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Apps\Frontend\AppAssetEnqueuer;
use Loopress\Apps\Frontend\AppShortcode;
use Loopress\Apps\Infrastructure\AppsDirectory;
use Loopress\Apps\Infrastructure\AppStore;
use Loopress\Apps\Module\AppsModule;
use Loopress\Apps\RestApi\AppsController;
use Loopress\Apps\Service\AppsDiagnostics;
use PHPUnit\Framework\MockObject\MockObject;
use Loopress\Tests\Unit\RecordsHooks;
use Loopress\Tests\Unit\DigsIntoArrays;
use PHPUnit\Framework\TestCase;

class AppsModuleTest extends TestCase
{
    private const SCRIPT_TAG = '<script src="x"></script>'; // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedScript

    use DigsIntoArrays;
    use RecordsHooks;

    private AppsDirectory&MockObject $directory;
    private AppsDiagnostics&MockObject $diagnostics;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->directory   = $this->createMock(AppsDirectory::class);
        $this->diagnostics = $this->createMock(AppsDiagnostics::class);

        $this->recordActions('rest_api_init', 'init');
        $this->recordFilters('loopress_push_resources', 'script_loader_tag', 'site_status_tests');
        $store = $this->createMock(AppStore::class);
        (new AppsModule(
            new AppsController($this->directory, $store, $this->diagnostics),
            new AppShortcode($store, new AppAssetEnqueuer($store)),
            new AppAssetEnqueuer($store),
            $this->directory,
            $this->diagnostics,
        ))->boot();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_routes_register_on_rest_api_init(): void
    {
        $routes = [];
        Functions\when('register_rest_route')->alias(static function (string $ns, string $route) use (&$routes): bool {
            $routes[] = $route;

            return true;
        });
        Functions\when('current_user_can')->justReturn(true);
        $this->directory->expects($this->once())->method('ensureExists');

        $this->fireAction('rest_api_init');

        $this->assertContains('/apps', $routes);
    }

    public function test_init_prepares_the_apps_folder_and_adds_the_shortcode(): void
    {
        $tags = [];
        Functions\when('add_shortcode')->alias(static function (string $tag) use (&$tags): void {
            $tags[] = $tag;
        });
        $this->directory->expects($this->once())->method('ensureExists');

        $this->fireAction('init');

        $this->assertSame(['loopress_app'], $tags);
    }

    public function test_the_push_log_knows_the_apps_resource(): void
    {
        $resources = $this->applyFilter('loopress_push_resources', ['acf:push' => ['label' => 'ACF', 'routes' => []]]);

        $this->assertIsArray($resources);
        $this->assertSame(['label' => 'Single-page apps', 'routes' => ['/apps']], $resources['app:push'] ?? null);
        $this->assertArrayHasKey('acf:push', $resources);
    }

    public function test_entry_scripts_are_flagged_as_modules_through_the_script_loader_tag_filter(): void
    {
        $this->assertSame(self::SCRIPT_TAG, $this->applyFilter('script_loader_tag', self::SCRIPT_TAG, 'jquery'));
    }

    public function test_site_health_reports_the_diagnostics_issues(): void
    {
        Functions\when('esc_url')->returnArg();
        Functions\when('admin_url')->returnArg();
        $this->diagnostics->method('getDiagnostics')->willReturn(['issues' => [['code' => 'x', 'message' => 'broken']], 'checks' => []]);

        $tests = $this->applyFilter('site_status_tests', []);

        $this->assertIsArray($tests);
        $direct = $tests['direct'] ?? [];
        $this->assertIsArray($direct);
        $this->assertArrayHasKey('loopress_apps', $direct);
        $test = self::at($direct, 'loopress_apps', 'test');
        $this->assertIsCallable($test);
        $result = $test();
        $this->assertIsArray($result);
        $this->assertSame('recommended', $result['status'] ?? null);
    }
}
