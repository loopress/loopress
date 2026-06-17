<?php

namespace Loopress\Tests\Unit\RestApi;

use Brain\Monkey;
use Loopress\Exception\ProductionLockException;
use Loopress\RestApi\VendorController;
use Loopress\Service\VendorService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;
use WP_REST_Response;

class VendorControllerTest extends TestCase
{
    private VendorService&MockObject $vendorService;
    private VendorController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->vendorService = $this->createMock(VendorService::class);
        $this->controller    = new VendorController($this->vendorService);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── get_versions ─────────────────────────────────────────────────────────

    public function test_get_versions_returns_400_for_missing_package(): void
    {
        $request  = new WP_REST_Request([]);
        $response = $this->controller->get_versions($request);
        $this->assertSame(400, $response->status);
    }

    public function test_get_versions_returns_400_for_invalid_package_name(): void
    {
        $request  = new WP_REST_Request(['package' => '../../../etc/passwd']);
        $response = $this->controller->get_versions($request);
        $this->assertSame(400, $response->status);
    }

    public function test_get_versions_returns_404_when_package_not_found(): void
    {
        $this->vendorService->method('getVersions')->willReturn(null);
        $request  = new WP_REST_Request(['package' => 'vendor/package']);
        $response = $this->controller->get_versions($request);
        $this->assertSame(404, $response->status);
    }

    public function test_get_versions_returns_versions_list(): void
    {
        $versions = [['version' => '1.0.0', 'php_compatible' => true, 'php_constraint' => '>=8.0']];
        $this->vendorService->method('getVersions')->willReturn($versions);
        $request  = new WP_REST_Request(['package' => 'vendor/package']);
        $response = $this->controller->get_versions($request);
        $this->assertSame(200, $response->status);
        $this->assertSame($versions, $response->data);
    }

    public function test_get_versions_returns_500_on_runtime_exception(): void
    {
        $this->vendorService->method('getVersions')
            ->willThrowException(new \RuntimeException('Network error'));
        $request  = new WP_REST_Request(['package' => 'vendor/package']);
        $response = $this->controller->get_versions($request);
        $this->assertSame(500, $response->status);
    }

    // ── require_package ───────────────────────────────────────────────────────

    public function test_require_package_returns_400_for_missing_package(): void
    {
        $request  = new WP_REST_Request(['version' => '1.0.0']);
        $response = $this->controller->require_package($request);
        $this->assertSame(400, $response->status);
    }

    public function test_require_package_returns_400_for_invalid_version(): void
    {
        $request  = new WP_REST_Request(['package' => 'vendor/pkg', 'version' => '; rm -rf /']);
        $response = $this->controller->require_package($request);
        $this->assertSame(400, $response->status);
    }

    public function test_require_package_returns_403_when_locked(): void
    {
        $this->vendorService->method('requirePackage')
            ->willThrowException(new ProductionLockException('Locked.'));
        $request  = new WP_REST_Request(['package' => 'vendor/pkg', 'version' => '^1.0']);
        $response = $this->controller->require_package($request);
        $this->assertSame(403, $response->status);
    }

    public function test_require_package_returns_200_on_success(): void
    {
        $this->vendorService->method('requirePackage')->willReturn('Output text');
        $request  = new WP_REST_Request(['package' => 'vendor/pkg', 'version' => '^1.0']);
        $response = $this->controller->require_package($request);
        $this->assertSame(200, $response->status);
        $this->assertArrayHasKey('message', $response->data);
        $this->assertArrayHasKey('output', $response->data);
    }

    public function test_require_package_returns_500_on_failure(): void
    {
        $this->vendorService->method('requirePackage')
            ->willThrowException(new \RuntimeException('Install failed.'));
        $request  = new WP_REST_Request(['package' => 'vendor/pkg', 'version' => '^1.0']);
        $response = $this->controller->require_package($request);
        $this->assertSame(500, $response->status);
    }

    // ── remove_package ────────────────────────────────────────────────────────

    public function test_remove_package_returns_400_for_invalid_package(): void
    {
        $request  = new WP_REST_Request(['package' => '']);
        $response = $this->controller->remove_package($request);
        $this->assertSame(400, $response->status);
    }

    public function test_remove_package_returns_403_when_locked(): void
    {
        $this->vendorService->method('removePackage')
            ->willThrowException(new ProductionLockException('Locked.'));
        $request  = new WP_REST_Request(['package' => 'vendor/pkg']);
        $response = $this->controller->remove_package($request);
        $this->assertSame(403, $response->status);
    }

    public function test_remove_package_returns_200_on_success(): void
    {
        $this->vendorService->method('removePackage')->willReturn('Removed.');
        $request  = new WP_REST_Request(['package' => 'vendor/pkg']);
        $response = $this->controller->remove_package($request);
        $this->assertSame(200, $response->status);
    }

    // ── repair ────────────────────────────────────────────────────────────────

    public function test_repair_returns_403_when_locked(): void
    {
        $this->vendorService->method('repair')
            ->willThrowException(new ProductionLockException('Locked.'));
        $response = $this->controller->repair(new WP_REST_Request());
        $this->assertSame(403, $response->status);
    }

    public function test_repair_returns_200_on_success(): void
    {
        $this->vendorService->method('repair')->willReturn('Done.');
        $response = $this->controller->repair(new WP_REST_Request());
        $this->assertSame(200, $response->status);
    }

    // ── get_diagnostics ───────────────────────────────────────────────────────

    public function test_get_diagnostics_returns_200_with_data(): void
    {
        $data = ['php_version' => '8.2.0', 'platform_php' => '8.2.0', 'issues' => []];
        $this->vendorService->method('getDiagnostics')->willReturn($data);
        $response = $this->controller->get_diagnostics(new WP_REST_Request());
        $this->assertSame(200, $response->status);
        $this->assertSame($data, $response->data);
    }

    // ── get_audit ─────────────────────────────────────────────────────────────

    public function test_get_audit_returns_200_on_success(): void
    {
        $data = ['advisories' => [], 'abandoned' => []];
        $this->vendorService->method('audit')->willReturn($data);
        $response = $this->controller->get_audit(new WP_REST_Request());
        $this->assertSame(200, $response->status);
    }

    public function test_get_audit_returns_500_on_failure(): void
    {
        $this->vendorService->method('audit')
            ->willThrowException(new \RuntimeException('Audit failed.'));
        $response = $this->controller->get_audit(new WP_REST_Request());
        $this->assertSame(500, $response->status);
    }

    // ── fix_platform ──────────────────────────────────────────────────────────

    public function test_fix_platform_returns_403_when_locked(): void
    {
        $this->vendorService->method('fixPlatform')
            ->willThrowException(new ProductionLockException('Locked.'));
        $response = $this->controller->fix_platform(new WP_REST_Request());
        $this->assertSame(403, $response->status);
    }

    public function test_fix_platform_returns_200_on_success(): void
    {
        $this->vendorService->method('fixPlatform');
        $response = $this->controller->fix_platform(new WP_REST_Request());
        $this->assertSame(200, $response->status);
        $this->assertArrayHasKey('php_version', $response->data);
    }
}
