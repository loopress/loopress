<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Infrastructure;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Update\Infrastructure\GithubReleaseChecker;
use PHPUnit\Framework\TestCase;

class GithubReleaseCheckerTest extends TestCase
{
    private GithubReleaseChecker $checker;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->checker = new GithubReleaseChecker();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    private function stubReleasesResponse(array $releases): void
    {
        Functions\when('wp_remote_get')->justReturn(['body' => json_encode($releases)]); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode
        Functions\when('is_wp_error')->justReturn(false);
        Functions\when('wp_remote_retrieve_body')->alias(fn(array $response) => $response['body']);
    }

    public function test_returns_cached_value_without_calling_github(): void
    {
        Functions\when('get_transient')->justReturn('2026.8.1');
        Functions\expect('wp_remote_get')->never();

        $this->assertSame('2026.8.1', $this->checker->getLatestVersion());
    }

    public function test_returns_null_when_cache_holds_the_empty_string_sentinel(): void
    {
        Functions\when('get_transient')->justReturn('');
        Functions\expect('wp_remote_get')->never();

        $this->assertNull($this->checker->getLatestVersion());
    }

    public function test_extracts_version_from_the_wordpress_plugin_release_tag(): void
    {
        Functions\when('get_transient')->justReturn(false);
        Functions\expect('set_transient')->once()->with('loopress_full_latest_version', '2026.8.1', 12 * HOUR_IN_SECONDS);
        $this->stubReleasesResponse([
            ['tag_name' => '@loopress/cli@4.2.0'],
            ['tag_name' => 'wordpress-plugin@2026.8.1'],
        ]);

        $this->assertSame('2026.8.1', $this->checker->getLatestVersion());
    }

    public function test_caches_null_as_the_empty_string_sentinel_when_no_plugin_release_is_found(): void
    {
        Functions\when('get_transient')->justReturn(false);
        Functions\expect('set_transient')->once()->with('loopress_full_latest_version', '', 12 * HOUR_IN_SECONDS);
        $this->stubReleasesResponse([
            ['tag_name' => '@loopress/cli@4.2.0'],
        ]);

        $this->assertNull($this->checker->getLatestVersion());
    }

    public function test_returns_null_on_wp_error_without_throwing(): void
    {
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        Functions\when('wp_remote_get')->justReturn(new \WP_Error('http_request_failed', 'Could not resolve host'));
        Functions\when('is_wp_error')->justReturn(true);

        $this->assertNull($this->checker->getLatestVersion());
    }

    public function test_returns_null_on_malformed_json_response(): void
    {
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        Functions\when('wp_remote_get')->justReturn(['body' => 'not json']);
        Functions\when('is_wp_error')->justReturn(false);
        Functions\when('wp_remote_retrieve_body')->justReturn('not json');

        $this->assertNull($this->checker->getLatestVersion());
    }
}
