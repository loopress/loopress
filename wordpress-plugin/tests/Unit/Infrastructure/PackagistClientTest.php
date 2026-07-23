<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Infrastructure;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Dependencies\Infrastructure\PackagistClient;
use Loopress\Tests\Stubs\FakeClientException;
use Loopress\Tests\Stubs\FakeHttpClient;
use Nyholm\Psr7\Factory\Psr17Factory;
use Nyholm\Psr7\Response;
use PHPUnit\Framework\TestCase;

class PackagistClientTest extends TestCase
{
    private FakeHttpClient $httpClient;
    private PackagistClient $client;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->httpClient = new FakeHttpClient();
        $this->client      = new PackagistClient($this->httpClient, new Psr17Factory());
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    /** @param array<string, array<string, mixed>> $versions */
    private function stubPackageResponse(array $versions): void
    {
        // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode
        $body = json_encode(['package' => ['versions' => $versions]]);
        $this->httpClient->willReturn(new Response(200, [], $body));
    }

    // ── caching ──────────────────────────────────────────────────────────────

    public function test_returns_cached_versions_without_calling_packagist(): void
    {
        $cached = [['version' => '1.0.0', 'php_compatible' => true, 'php_constraint' => '>=7.4']];
        Functions\when('get_transient')->justReturn(['versions' => $cached]);

        $this->assertSame($cached, $this->client->getVersions('guzzlehttp/guzzle'));
        $this->assertNull($this->httpClient->lastRequest);
    }

    public function test_returns_null_when_the_cached_entry_is_a_known_not_found(): void
    {
        // Cached ['versions' => null], not a cache miss (get_transient() returning false):
        // a previously-checked, genuinely nonexistent package must not hit Packagist again.
        Functions\when('get_transient')->justReturn(['versions' => null]);

        $this->assertNull($this->client->getVersions('unknown/package'));
        $this->assertNull($this->httpClient->lastRequest);
    }

    // ── fetchVersions ────────────────────────────────────────────────────────

    public function test_returns_null_when_the_package_has_no_versions(): void
    {
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        $this->stubPackageResponse([]);

        $this->assertNull($this->client->getVersions('unknown/package'));
    }

    public function test_excludes_dev_versions_and_sorts_stable_versions_descending(): void
    {
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        $this->stubPackageResponse([
            'dev-master' => ['version' => 'dev-master'],
            '1.0.x-dev'  => ['version' => '1.0.x-dev'],
            '1.0.0'      => ['version' => '1.0.0', 'version_normalized' => '1.0.0.0'],
            '2.0.0'      => ['version' => '2.0.0', 'version_normalized' => '2.0.0.0'],
        ]);

        $result = $this->client->getVersions('guzzlehttp/guzzle');

        $this->assertCount(2, $result);
        $this->assertSame('2.0.0', $result[0]['version']);
        $this->assertSame('1.0.0', $result[1]['version']);
    }

    public function test_reports_php_compatibility_from_the_require_constraint(): void
    {
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        $this->stubPackageResponse([
            '1.0.0' => ['version' => '1.0.0', 'version_normalized' => '1.0.0.0', 'require' => ['php' => '>=1.0']],
        ]);

        $result = $this->client->getVersions('guzzlehttp/guzzle');

        $this->assertTrue($result[0]['php_compatible']);
        $this->assertSame('>=1.0', $result[0]['php_constraint']);
    }

    public function test_php_compatible_is_null_when_no_php_constraint_is_declared(): void
    {
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        $this->stubPackageResponse([
            '1.0.0' => ['version' => '1.0.0', 'version_normalized' => '1.0.0.0'],
        ]);

        $result = $this->client->getVersions('guzzlehttp/guzzle');

        $this->assertNull($result[0]['php_constraint']);
        $this->assertNull($result[0]['php_compatible']);
    }

    // ── errors ───────────────────────────────────────────────────────────────

    public function test_throws_on_network_error(): void
    {
        Functions\when('get_transient')->justReturn(false);
        $this->httpClient->willThrow(new FakeClientException('Could not resolve host'));

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Could not resolve host');
        $this->client->getVersions('guzzlehttp/guzzle');
    }

    public function test_throws_on_malformed_json_response(): void
    {
        Functions\when('get_transient')->justReturn(false);
        $this->httpClient->willReturn(new Response(200, [], 'not json'));

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Invalid response from Packagist');
        $this->client->getVersions('guzzlehttp/guzzle');
    }

    public function test_sends_the_request_to_the_packagist_package_url(): void
    {
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        $this->stubPackageResponse([]);

        $this->client->getVersions('guzzlehttp/guzzle');

        $this->assertSame(
            'https://packagist.org/packages/guzzlehttp/guzzle.json',
            (string) $this->httpClient->lastRequest->getUri(),
        );
    }
}
