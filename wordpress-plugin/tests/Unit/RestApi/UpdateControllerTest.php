<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\RestApi;

use Brain\Monkey;
use Loopress\Update\Infrastructure\GithubReleaseChecker;
use Loopress\Update\RestApi\UpdateController;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class UpdateControllerTest extends TestCase
{
    private GithubReleaseChecker&MockObject $checker;
    private UpdateController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->checker   = $this->createMock(GithubReleaseChecker::class);
        $this->controller = new UpdateController($this->checker);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_reports_no_update_available_when_already_on_latest(): void
    {
        $this->checker->method('getLatestVersion')->willReturn(LOOPRESS_VERSION);

        $response = $this->controller->get_status(new WP_REST_Request());
        $data     = $response->get_data();

        $this->assertFalse($data['update_available']);
        $this->assertNull($data['release_url']);
        $this->assertSame(LOOPRESS_VERSION, $data['current_version']);
        $this->assertSame(LOOPRESS_VERSION, $data['latest_version']);
    }

    public function test_reports_no_update_available_when_checker_returns_null(): void
    {
        $this->checker->method('getLatestVersion')->willReturn(null);

        $response = $this->controller->get_status(new WP_REST_Request());
        $data     = $response->get_data();

        $this->assertFalse($data['update_available']);
        $this->assertNull($data['latest_version']);
        $this->assertNull($data['release_url']);
    }

    public function test_reports_update_available_with_a_github_release_url_when_a_newer_version_exists(): void
    {
        $this->checker->method('getLatestVersion')->willReturn('2999.1.1');

        $response = $this->controller->get_status(new WP_REST_Request());
        $data     = $response->get_data();

        $this->assertTrue($data['update_available']);
        $this->assertSame('2999.1.1', $data['latest_version']);
        $this->assertSame(
            'https://github.com/loopress/loopress/releases/tag/wordpress-plugin%402999.1.1',
            $data['release_url']
        );
    }

    public function test_response_status_is_200(): void
    {
        $this->checker->method('getLatestVersion')->willReturn(null);

        $response = $this->controller->get_status(new WP_REST_Request());

        $this->assertSame(200, $response->status);
    }
}
