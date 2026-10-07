<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Apps\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Apps\Infrastructure\AppsDirectory;
use Loopress\Apps\Service\AppsDiagnostics;
use Nyholm\Psr7\Response;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;

class AppsDiagnosticsTest extends TestCase
{
    private ClientInterface&MockObject $httpClient;
    private AppsDirectory&MockObject $directory;
    private AppsDiagnostics $service;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->httpClient = $this->createMock(ClientInterface::class);
        $this->directory  = $this->createMock(AppsDirectory::class);
        $this->service    = new AppsDiagnostics($this->httpClient, $this->directory);

        // No cache; capture whatever gets written but return a real URL for the probe.
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        Functions\when('content_url')->alias(static fn (string $path): string => 'https://example.test/wp-content/' . $path);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    private function withOneDeployedAsset(): void
    {
        $this->directory->method('listAppNames')->willReturn(['search']);
        $this->directory->method('firstAssetPath')->willReturn('assets/index-abc.js');
    }

    public function test_no_issue_when_assets_are_served_with_nosniff(): void
    {
        $this->withOneDeployedAsset();
        $this->httpClient->method('sendRequest')->willReturn(new Response(200, ['X-Content-Type-Options' => 'nosniff']));

        $this->assertSame([], $this->service->getDiagnostics()['issues']);
    }

    public function test_reports_missing_nosniff_header(): void
    {
        $this->withOneDeployedAsset();
        $this->httpClient->method('sendRequest')->willReturn(new Response(200)); // no nosniff header

        $issues = $this->service->getDiagnostics()['issues'];
        $this->assertCount(1, $issues);
        $this->assertSame('apps_assets_missing_nosniff', $issues[0]['code']);
    }

    public function test_no_issue_when_no_app_is_deployed(): void
    {
        $this->directory->method('listAppNames')->willReturn([]);
        // The probe must never even be attempted when there is nothing to serve.
        $this->httpClient->expects($this->never())->method('sendRequest');

        $this->assertSame([], $this->service->getDiagnostics()['issues']);
    }

    public function test_no_false_positive_on_network_failure(): void
    {
        $this->withOneDeployedAsset();
        $this->httpClient->method('sendRequest')->willThrowException(
            new class('boom') extends \RuntimeException implements \Psr\Http\Client\ClientExceptionInterface {}
        );

        $this->assertSame([], $this->service->getDiagnostics()['issues']);
    }

    public function test_uses_the_cached_result_without_probing(): void
    {
        Functions\when('get_transient')->justReturn(['missing' => true]);
        $this->httpClient->expects($this->never())->method('sendRequest');

        $issues = $this->service->getDiagnostics()['issues'];
        $this->assertCount(1, $issues);
        $this->assertSame('apps_assets_missing_nosniff', $issues[0]['code']);
    }

    public function test_probes_the_public_url_of_a_deployed_asset(): void
    {
        $this->withOneDeployedAsset();
        $this->httpClient->expects($this->once())
            ->method('sendRequest')
            ->with($this->callback(static fn(RequestInterface $request): bool => (string) $request->getUri() === 'https://example.test/wp-content/loopress/apps/search/assets/index-abc.js'))
            ->willReturn(new Response(200, ['X-Content-Type-Options' => 'nosniff']));

        $this->service->getDiagnostics();
    }
}
