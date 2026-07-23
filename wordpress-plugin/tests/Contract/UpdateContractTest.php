<?php

declare(strict_types=1);

namespace Loopress\Tests\Contract;

use Loopress\Update\Infrastructure\GithubReleaseChecker;
use Loopress\Update\RestApi\UpdateController;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class UpdateContractTest extends TestCase
{
    use AssertsJsonSchema;

    private GithubReleaseChecker&MockObject $checker;
    private UpdateController $controller;

    protected function setUp(): void
    {
        parent::setUp();

        if (!defined('LOOPRESS_VERSION')) {
            define('LOOPRESS_VERSION', '2026.7.0');
        }

        $this->checker    = $this->createMock(GithubReleaseChecker::class);
        $this->controller = new UpdateController($this->checker);
    }

    public function test_get_status_response_matches_schema_when_up_to_date(): void
    {
        $this->checker->method('getLatestVersion')->willReturn(LOOPRESS_VERSION);

        $response = $this->controller->get_status(new WP_REST_Request());

        $this->assertMatchesSchema('update-status.schema.json', $response->data);
    }

    public function test_get_status_response_matches_schema_when_update_available(): void
    {
        $this->checker->method('getLatestVersion')->willReturn('2099.1.1');

        $response = $this->controller->get_status(new WP_REST_Request());

        $this->assertMatchesSchema('update-status.schema.json', $response->data);
    }
}
