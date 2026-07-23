<?php

declare(strict_types=1);

namespace Loopress\Tests\Contract;

use Brain\Monkey;
use Loopress\Dependencies\RestApi\ComposerController;
use Loopress\Dependencies\Service\ComposerService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class ComposerContractTest extends TestCase
{
    use AssertsJsonSchema;

    private ComposerService&MockObject $composerService;
    private ComposerController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->composerService = $this->createMock(ComposerService::class);
        $this->controller       = new ComposerController($this->composerService);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_get_versions_response_matches_schema(): void
    {
        $this->composerService->method('getVersions')->willReturn([
            ['version' => '7.8.0', 'php_compatible' => true, 'php_constraint' => '>=7.2.5'],
        ]);

        $response = $this->controller->get_versions(new WP_REST_Request(['package' => 'guzzlehttp/guzzle']));

        $this->assertMatchesSchema('composer-versions.schema.json', $response->data);
    }

    public function test_get_installed_response_matches_schema(): void
    {
        $this->composerService->method('getInstalled')->willReturn([
            ['name' => 'guzzlehttp/guzzle', 'constraint' => '^7.0', 'version' => '7.8.1'],
        ]);

        $response = $this->controller->get_installed(new WP_REST_Request());

        $this->assertMatchesSchema('composer-installed.schema.json', $response->data);
    }

    public function test_require_package_response_matches_schema(): void
    {
        $this->composerService->method('requirePackage')->willReturn('Package installed.');

        $request = new WP_REST_Request(['package' => 'guzzlehttp/guzzle', 'version' => '^7.0']);
        $response = $this->controller->require_package($request);

        $this->assertMatchesSchema('composer-message.schema.json', $response->data);
    }

    public function test_remove_package_response_matches_schema(): void
    {
        $this->composerService->method('removePackage')->willReturn('Package removed.');

        $response = $this->controller->remove_package(new WP_REST_Request(['package' => 'guzzlehttp/guzzle']));

        $this->assertMatchesSchema('composer-message.schema.json', $response->data);
    }

    public function test_repair_response_matches_schema(): void
    {
        $this->composerService->method('repair')->willReturn('Nothing to install.');

        $response = $this->controller->repair(new WP_REST_Request());

        $this->assertMatchesSchema('composer-message.schema.json', $response->data);
    }

    public function test_sync_response_matches_schema(): void
    {
        $this->composerService->method('sync')->willReturn('Installed.');

        $request = new WP_REST_Request(['composerJson' => '{"name":"demo/site"}', 'composerLock' => null]);
        $response = $this->controller->sync($request);

        $this->assertMatchesSchema('composer-message.schema.json', $response->data);
    }

    public function test_get_diagnostics_response_matches_schema(): void
    {
        $this->composerService->method('getDiagnostics')->willReturn([
            'php_version'  => '8.2.29',
            'platform_php' => '8.2.29',
            'issues'       => [],
        ]);

        $response = $this->controller->get_diagnostics(new WP_REST_Request());

        $this->assertMatchesSchema('composer-diagnostics.schema.json', $response->data);
    }

    public function test_get_diagnostics_response_matches_schema_with_issues(): void
    {
        $this->composerService->method('getDiagnostics')->willReturn([
            'php_version'  => '8.2.29',
            'platform_php' => null,
            'issues'       => [['code' => 'platform_php_missing', 'message' => 'Not set.']],
        ]);

        $response = $this->controller->get_diagnostics(new WP_REST_Request());

        $this->assertMatchesSchema('composer-diagnostics.schema.json', $response->data);
    }

    public function test_get_outdated_response_matches_schema(): void
    {
        $this->composerService->method('getOutdated')->willReturn([
            ['name' => 'guzzlehttp/guzzle', 'version' => '7.8.0', 'latest' => '7.9.0'],
        ]);

        $response = $this->controller->get_outdated(new WP_REST_Request());

        $this->assertMatchesSchema('composer-outdated.schema.json', $response->data);
    }

    public function test_get_audit_response_matches_schema(): void
    {
        $this->composerService->method('audit')->willReturn(['advisories' => [], 'abandoned' => []]);

        $response = $this->controller->get_audit(new WP_REST_Request());

        $this->assertMatchesSchema('composer-audit.schema.json', $response->data);
    }

    public function test_fix_platform_response_matches_schema(): void
    {
        $this->composerService->method('fixPlatform');

        $response = $this->controller->fix_platform(new WP_REST_Request());

        $this->assertMatchesSchema('composer-fix-platform.schema.json', $response->data);
    }

    public function test_get_json_response_matches_schema(): void
    {
        $this->composerService->method('getJson')->willReturn('{"name":"demo/site"}');

        $response = $this->controller->get_json(new WP_REST_Request());

        $this->assertMatchesSchema('composer-json.schema.json', $response->data);
    }

    public function test_get_lock_response_matches_schema(): void
    {
        $this->composerService->method('getLock')->willReturn('{"packages":[]}');

        $response = $this->controller->get_lock(new WP_REST_Request());

        $this->assertMatchesSchema('composer-lock.schema.json', $response->data);
    }
}
