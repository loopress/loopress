<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Update\Infrastructure;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Tests\Stubs\FakeClientException;
use Loopress\Tests\Stubs\FakeHttpClient;
use Loopress\Update\Infrastructure\GithubReleaseChecker;
use Nyholm\Psr7\Response;
use PHPUnit\Framework\TestCase;

class GithubReleaseCheckerTest extends TestCase
{
    private FakeHttpClient $httpClient;
    private GithubReleaseChecker $checker;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->httpClient = new FakeHttpClient();
        $this->checker    = new GithubReleaseChecker($this->httpClient);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    /** @param array<int, array<string, mixed>> $releases */
    private function stubReleasesResponse(array $releases): void
    {
        $this->httpClient->willReturn(new Response(200, [], json_encode($releases)));
    }

    public function test_returns_cached_version_without_calling_github(): void
    {
        Functions\when('get_transient')->justReturn(['version' => '2026.8.1', 'zip_url' => 'https://example.com/loopress-full.zip']);

        $this->assertSame('2026.8.1', $this->checker->getLatestVersion());
        $this->assertNull($this->httpClient->lastRequest);
    }

    public function test_returns_cached_download_url_without_calling_github(): void
    {
        Functions\when('get_transient')->justReturn(['version' => '2026.8.1', 'zip_url' => 'https://example.com/loopress-full.zip']);

        $this->assertSame('https://example.com/loopress-full.zip', $this->checker->getLatestDownloadUrl());
        $this->assertNull($this->httpClient->lastRequest);
    }

    public function test_returns_null_when_cache_holds_the_empty_string_sentinel(): void
    {
        Functions\when('get_transient')->justReturn('');

        $this->assertNull($this->checker->getLatestVersion());
        $this->assertNull($this->checker->getLatestDownloadUrl());
        $this->assertNull($this->httpClient->lastRequest);
    }

    public function test_extracts_version_and_zip_url_from_the_wordpress_plugin_release(): void
    {
        Functions\when('get_transient')->justReturn(false);
        Functions\expect('set_transient')->once()->with(
            'loopress_full_latest_release',
            ['version' => '2026.8.1', 'zip_url' => 'https://github.com/loopress/loopress/releases/download/wordpress-plugin@2026.8.1/loopress-full.zip'],
            12 * HOUR_IN_SECONDS,
        );
        $this->stubReleasesResponse([
            ['tag_name' => '@loopress/cli@4.2.0'],
            [
                'tag_name' => 'wordpress-plugin@2026.8.1',
                'assets'   => [
                    ['name' => 'loopress-light.zip', 'browser_download_url' => 'https://github.com/loopress/loopress/releases/download/wordpress-plugin@2026.8.1/loopress-light.zip'],
                    ['name' => 'loopress-full.zip', 'browser_download_url' => 'https://github.com/loopress/loopress/releases/download/wordpress-plugin@2026.8.1/loopress-full.zip'],
                ],
            ],
        ]);

        $this->assertSame('2026.8.1', $this->checker->getLatestVersion());
        $this->assertSame(
            'https://api.github.com/repos/loopress/loopress/releases?per_page=10',
            (string) $this->httpClient->lastRequest->getUri(),
        );
    }

    public function test_download_url_is_null_when_the_matching_release_has_no_zip_asset_yet(): void
    {
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        $this->stubReleasesResponse([
            ['tag_name' => 'wordpress-plugin@2026.8.1', 'assets' => []],
        ]);

        $this->assertSame('2026.8.1', $this->checker->getLatestVersion());
        $this->assertNull($this->checker->getLatestDownloadUrl());
    }

    public function test_caches_null_as_the_empty_string_sentinel_when_no_plugin_release_is_found(): void
    {
        Functions\when('get_transient')->justReturn(false);
        Functions\expect('set_transient')->once()->with('loopress_full_latest_release', '', 12 * HOUR_IN_SECONDS);
        $this->stubReleasesResponse([
            ['tag_name' => '@loopress/cli@4.2.0'],
        ]);

        $this->assertNull($this->checker->getLatestVersion());
        $this->assertNull($this->checker->getLatestDownloadUrl());
    }

    public function test_returns_null_on_network_error_without_throwing(): void
    {
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        $this->httpClient->willThrow(new FakeClientException('Could not resolve host'));

        $this->assertNull($this->checker->getLatestVersion());
    }

    public function test_returns_null_on_malformed_json_response(): void
    {
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        $this->httpClient->willReturn(new Response(200, [], 'not json'));

        $this->assertNull($this->checker->getLatestVersion());
    }
}
