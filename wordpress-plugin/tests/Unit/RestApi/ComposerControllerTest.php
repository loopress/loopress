<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\RestApi;

use Brain\Monkey;
use Loopress\Dependencies\Exception\ConcurrentOperationException;
use Loopress\Dependencies\RestApi\ComposerController;
use Loopress\Dependencies\Service\ComposerService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class ComposerControllerTest extends TestCase
{
    private ComposerService&MockObject $composerService;
    private ComposerController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->composerService = $this->createMock(ComposerService::class);
        $this->controller    = new ComposerController($this->composerService);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    /** @return mixed */
    private function invokePrivate(string $method, mixed ...$args): mixed
    {
        $ref = new \ReflectionMethod(ComposerController::class, $method);
        $ref->setAccessible(true);
        return $ref->invoke($this->controller, ...$args);
    }

    // ── arg validation ───────────────────────────────────────────────────────

    public function test_package_arg_is_required(): void
    {
        $arg = $this->invokePrivate('packageArg', true);
        $this->assertTrue($arg['required']);
    }

    public function test_package_arg_rejects_invalid_names(): void
    {
        $validate = $this->invokePrivate('packageArg', true)['validate_callback'];
        $this->assertFalse($validate(''));
        $this->assertFalse($validate('../../../etc/passwd'));
        $this->assertFalse($validate('no-slash'));
        $this->assertTrue($validate('vendor/package'));
        $this->assertTrue($validate('guzzlehttp/guzzle'));
    }

    public function test_version_arg_rejects_invalid_constraints(): void
    {
        $validate = $this->invokePrivate('versionArg', false)['validate_callback'];
        $this->assertFalse($validate('; rm -rf /'));
        $this->assertFalse($validate('$(evil)'));
        $this->assertTrue($validate('^1.0'));
        $this->assertTrue($validate('*'));
        $this->assertTrue($validate('1.2.3'));
    }

    public function test_version_arg_accepts_common_composer_constraints(): void
    {
        $validate = $this->invokePrivate('versionArg', false)['validate_callback'];
        $this->assertTrue($validate('>=8.0'));
        $this->assertTrue($validate('~1.2'));
        $this->assertTrue($validate('^1.0 || ^2.0'));
        $this->assertTrue($validate('>=1.0, <2.0'));
        $this->assertTrue($validate('dev-main'));
        $this->assertTrue($validate('1.0.0-beta1@dev'));
    }

    // ── get_versions ─────────────────────────────────────────────────────────

    public function test_get_versions_returns_404_when_package_not_found(): void
    {
        $this->composerService->method('getVersions')->willReturn(null);
        $request  = new WP_REST_Request(['package' => 'vendor/package']);
        $response = $this->controller->get_versions($request);
        $this->assertSame(404, $response->status);
    }

    public function test_get_versions_returns_versions_list(): void
    {
        $versions = [['version' => '1.0.0', 'php_compatible' => true, 'php_constraint' => '>=8.0']];
        $this->composerService->method('getVersions')->willReturn($versions);
        $request  = new WP_REST_Request(['package' => 'vendor/package']);
        $response = $this->controller->get_versions($request);
        $this->assertSame(200, $response->status);
        $this->assertSame($versions, $response->data);
    }

    public function test_get_versions_returns_500_on_runtime_exception(): void
    {
        $this->composerService->method('getVersions')
            ->willThrowException(new \RuntimeException('Network error'));
        $request  = new WP_REST_Request(['package' => 'vendor/package']);
        $response = $this->controller->get_versions($request);
        $this->assertSame(500, $response->status);
    }

    // ── require_package ───────────────────────────────────────────────────────

    public function test_require_package_returns_200_on_success(): void
    {
        $this->composerService->method('requirePackage')->willReturn('Output text');
        $request  = new WP_REST_Request(['package' => 'vendor/pkg', 'version' => '^1.0']);
        $response = $this->controller->require_package($request);
        $this->assertSame(200, $response->status);
        $this->assertArrayHasKey('message', $response->data);
        $this->assertArrayHasKey('output', $response->data);
    }

    public function test_require_package_returns_500_on_failure(): void
    {
        $this->composerService->method('requirePackage')
            ->willThrowException(new \RuntimeException('Install failed.'));
        $request  = new WP_REST_Request(['package' => 'vendor/pkg', 'version' => '^1.0']);
        $response = $this->controller->require_package($request);
        $this->assertSame(500, $response->status);
    }

    public function test_require_package_returns_409_when_another_operation_is_running(): void
    {
        $this->composerService->method('requirePackage')
            ->willThrowException(new ConcurrentOperationException('Another Composer operation is already running.'));
        $request  = new WP_REST_Request(['package' => 'vendor/pkg', 'version' => '^1.0']);
        $response = $this->controller->require_package($request);
        $this->assertSame(409, $response->status);
    }

    public function test_sync_returns_409_when_another_operation_is_running(): void
    {
        $this->composerService->method('sync')
            ->willThrowException(new ConcurrentOperationException('Another Composer operation is already running.'));
        $request  = new WP_REST_Request(['composerJson' => '{}']);
        $response = $this->controller->sync($request);
        $this->assertSame(409, $response->status);
    }

    // ── get_json ─────────────────────────────────────────────────────────────

    public function test_get_json_returns_404_when_missing(): void
    {
        $this->composerService->method('getJson')->willReturn(null);
        $response = $this->controller->get_json(new WP_REST_Request());
        $this->assertSame(404, $response->status);
    }

    public function test_get_json_returns_200_with_composer_json(): void
    {
        $this->composerService->method('getJson')->willReturn('{"name":"demo/site"}');
        $response = $this->controller->get_json(new WP_REST_Request());
        $this->assertSame(200, $response->status);
        $this->assertSame('{"name":"demo/site"}', $response->data['composerJson']);
    }

    // ── remove_package ────────────────────────────────────────────────────────

    public function test_remove_package_returns_200_on_success(): void
    {
        $this->composerService->method('removePackage')->willReturn('Removed.');
        $request  = new WP_REST_Request(['package' => 'vendor/pkg']);
        $response = $this->controller->remove_package($request);
        $this->assertSame(200, $response->status);
    }

    // ── repair ────────────────────────────────────────────────────────────────

    public function test_repair_returns_200_on_success(): void
    {
        $this->composerService->method('repair')->willReturn('Done.');
        $response = $this->controller->repair(new WP_REST_Request());
        $this->assertSame(200, $response->status);
    }

    // ── get_diagnostics ───────────────────────────────────────────────────────

    public function test_get_diagnostics_returns_200_with_data(): void
    {
        $data = ['php_version' => '8.2.0', 'platform_php' => '8.2.0', 'issues' => []];
        $this->composerService->method('getDiagnostics')->willReturn($data);
        $response = $this->controller->get_diagnostics(new WP_REST_Request());
        $this->assertSame(200, $response->status);
        $this->assertSame($data, $response->data);
    }

    // ── get_outdated ──────────────────────────────────────────────────────────

    public function test_get_outdated_returns_200_with_data(): void
    {
        $data = [['name' => 'vendor/pkg', 'version' => '1.0.0', 'latest' => '1.1.0']];
        $this->composerService->method('getOutdated')->willReturn($data);
        $response = $this->controller->get_outdated(new WP_REST_Request());
        $this->assertSame(200, $response->status);
        $this->assertSame($data, $response->data);
    }

    public function test_get_outdated_returns_500_on_failure(): void
    {
        $this->composerService->method('getOutdated')
            ->willThrowException(new \RuntimeException('Outdated check failed.'));
        $response = $this->controller->get_outdated(new WP_REST_Request());
        $this->assertSame(500, $response->status);
    }

    public function test_get_outdated_returns_409_when_another_operation_is_running(): void
    {
        $this->composerService->method('getOutdated')
            ->willThrowException(new ConcurrentOperationException('Another Composer operation is already running.'));
        $response = $this->controller->get_outdated(new WP_REST_Request());
        $this->assertSame(409, $response->status);
    }

    // ── get_audit ─────────────────────────────────────────────────────────────

    public function test_get_audit_returns_200_on_success(): void
    {
        $data = ['advisories' => [], 'abandoned' => []];
        $this->composerService->method('audit')->willReturn($data);
        $response = $this->controller->get_audit(new WP_REST_Request());
        $this->assertSame(200, $response->status);
    }

    public function test_get_audit_returns_500_on_failure(): void
    {
        $this->composerService->method('audit')
            ->willThrowException(new \RuntimeException('Audit failed.'));
        $response = $this->controller->get_audit(new WP_REST_Request());
        $this->assertSame(500, $response->status);
    }

    // ── fix_platform ──────────────────────────────────────────────────────────

    public function test_fix_platform_returns_200_on_success(): void
    {
        $this->composerService->method('fixPlatform');
        $response = $this->controller->fix_platform(new WP_REST_Request());
        $this->assertSame(200, $response->status);
        $this->assertArrayHasKey('php_version', $response->data);
    }
}
