<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\RestApi;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Acf\RestApi\AcfController;
use Loopress\Capabilities\RestApi\CapabilitiesController;
use Loopress\Options\RestApi\OptionsController;
use Loopress\Api\RestApi\ApiNamespaceController;
use Loopress\Blocks\RestApi\BlockFilesController;
use Loopress\Form\RestApi\FormController;
use Loopress\Menu\RestApi\MenuController;
use Loopress\PostTypes\RestApi\DeclaredTypesController;
use Loopress\PostTypes\Service\PostTypeService;
use Loopress\Pushes\PushLog;
use Loopress\SiteReport\RestApi\SiteTokenController;
use Loopress\Pushes\RestApi\PushesController;
use Loopress\Sentry\RestApi\SentryConsentController;
use Loopress\Settings\RestApi\SettingsController;
use Loopress\Tests\Unit\CapturesRoutes;
use Loopress\Update\Infrastructure\GithubReleaseChecker;
use Loopress\Update\RestApi\UpdateController;
use Loopress\Update\RestApi\UsageStatsController;
use PHPUnit\Framework\TestCase;

class RouteRegistrationTest extends TestCase
{
    use CapturesRoutes;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->captureRoutes();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_api_namespace_routes_validate_the_namespace_before_it_is_stored(): void
    {
        (new ApiNamespaceController())->register_routes();

        $this->assertSame(['GET /api-namespace', 'PUT /api-namespace'], $this->registered());
        $this->assertGuardedByManageOptions();
        $validate = $this->routeArg('/api-namespace', 'PUT', 'namespace', 'validate_callback');
        $this->assertIsCallable($validate);
        $this->assertTrue($validate('shop/v1'));
        $this->assertFalse($validate('loopress/v1'));
        $this->assertFalse($validate(12));
    }

    public function test_sentry_consent_routes_require_a_boolean(): void
    {
        (new SentryConsentController())->register_routes();

        $this->assertSame(['GET /sentry/consent', 'PUT /sentry/consent'], $this->registered());
        $this->assertGuardedByManageOptions();
        $this->assertSame(['required' => true, 'type' => 'boolean'], $this->routeArg('/sentry/consent', 'PUT', 'enabled'));
    }

    public function test_usage_stats_routes_require_a_boolean(): void
    {
        (new UsageStatsController())->register_routes();

        $this->assertSame(['GET /usage-stats/consent', 'PUT /usage-stats/consent'], $this->registered());
        $this->assertGuardedByManageOptions();
        $this->assertSame(['required' => true, 'type' => 'boolean'], $this->routeArg('/usage-stats/consent', 'PUT', 'enabled'));
    }

    public function test_settings_reset_is_a_delete_for_admins_only(): void
    {
        (new SettingsController())->register_routes();

        $this->assertSame(['DELETE /settings'], $this->registered());
        $this->assertGuardedByManageOptions();
    }

    public function test_update_routes_read_the_status_and_force_a_check(): void
    {
        (new UpdateController($this->createStub(GithubReleaseChecker::class)))->register_routes();

        $this->assertSame(['GET /update', 'POST /update/check'], $this->registered());
        $this->assertGuardedByManageOptions();
    }

    public function test_pushes_route_only_records_known_resources(): void
    {
        Functions\when('apply_filters')->alias(static fn(string $hook, mixed $value = null): mixed => $value);
        (new PushesController($this->createStub(PushLog::class)))->register_routes();

        $this->assertSame(['GET /pushes', 'POST /pushes'], $this->registered());
        $this->assertGuardedByManageOptions();
        $this->assertTrue($this->routeArg('/pushes', 'POST', 'resource', 'required'));
        $this->assertSame(array_keys(PushLog::resources()), $this->routeArg('/pushes', 'POST', 'resource', 'enum'));
    }

    /**
     * @template T of object
     * @param class-string<T> $className
     * @return T
     */
    private function withoutDependencies(string $className): object
    {
        return (new \ReflectionClass($className))->newInstanceWithoutConstructor();
    }

    public function test_menu_routes_cover_menus_and_their_locations(): void
    {
        $this->withoutDependencies(MenuController::class)->register_routes();

        $this->assertSame(['DELETE /menus/(?P<slug>[^/]+)', 'GET /menu-locations', 'GET /menus', 'GET /menus/(?P<slug>[^/]+)', 'POST /menus', 'PUT /menu-locations'], $this->registered());
        $this->assertGuardedByManageOptions();
    }

    public function test_site_report_routes_connect_and_disconnect_with_a_token(): void
    {
        (new SiteTokenController())->register_routes();

        $this->assertSame(['DELETE /site-report', 'GET /site-report', 'PUT /site-report'], $this->registered());
        $this->assertGuardedByManageOptions();
        $this->assertSame(['required' => true, 'type' => 'string'], $this->routeArg('/site-report', 'PUT', 'token'));
    }

    public function test_form_block_and_post_type_routes_are_registered_for_admins_only(): void
    {
        $this->withoutDependencies(FormController::class)->register_routes();
        $forms = $this->registered();
        $this->assertNotSame([], $forms);
        $this->assertGuardedByManageOptions();

        $this->routes = [];
        (new DeclaredTypesController($this->createStub(PostTypeService::class), 'post-types', 'Post type'))->register_routes();
        $this->assertNotSame([], $this->registered());
        $this->assertGuardedByManageOptions();

        $this->routes = [];
        $this->withoutDependencies(BlockFilesController::class)->register_routes();
        $this->assertNotSame([], $this->registered());
        $this->assertGuardedByManageOptions();
    }

    public function test_acf_capabilities_and_options_routes_are_registered_for_admins_only(): void
    {
        foreach ([AcfController::class, CapabilitiesController::class, OptionsController::class] as $controller) {
            $this->routes = [];
            $this->withoutDependencies($controller)->register_routes();

            $this->assertNotSame([], $this->registered(), $controller);
            $this->assertGuardedByManageOptions();
        }
    }
}
