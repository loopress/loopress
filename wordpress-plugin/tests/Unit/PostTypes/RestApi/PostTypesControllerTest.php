<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\PostTypes\RestApi;

use Brain\Monkey;
use Loopress\PostTypes\Exception\InvalidPostTypeException;
use Loopress\PostTypes\Exception\StalePostTypeRevisionException;
use Loopress\PostTypes\RestApi\PostTypesController;
use Loopress\PostTypes\Service\PostTypeService;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class PostTypesControllerTest extends TestCase
{
    private PostTypesController $controller;
    private PostTypeService&MockObject $service;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->service    = $this->createMock(PostTypeService::class);
        $this->controller = new PostTypesController($this->service);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    private function jsonRequest(mixed $body): WP_REST_Request
    {
        $request = new WP_REST_Request();
        $request->set_json_params($body);

        return $request;
    }

    public function test_get_returns_404_when_not_stored(): void
    {
        $this->service->method('get')->willReturn(null);

        $this->assertSame(404, $this->controller->get_post_type(new WP_REST_Request(['slug' => 'book']))->status);
    }

    public function test_upsert_passes_slug_args_and_revision_to_the_service(): void
    {
        $this->service->expects($this->once())->method('upsert')->with('book', ['public' => true], 'rev-1')
            ->willReturn(['slug' => 'book', 'args' => ['public' => true], 'revision' => 'rev-2']);

        $response = $this->controller->upsert_post_type($this->jsonRequest(['slug' => 'book', 'args' => ['public' => true], 'expectedRevision' => 'rev-1']));

        $this->assertSame(200, $response->status);
    }

    /** @return array<string, array{mixed}> */
    public static function malformedBodies(): array
    {
        return [
            'no slug'               => [['args' => []]],
            'args is a list'        => [['slug' => 'book', 'args' => [1, 2]]],
            'args missing'          => [['slug' => 'book']],
            'numeric revision'      => [['slug' => 'book', 'args' => [], 'expectedRevision' => 3]],
        ];
    }

    #[DataProvider('malformedBodies')]
    public function test_upsert_returns_400_for_a_malformed_body(mixed $body): void
    {
        $this->service->expects($this->never())->method('upsert');

        $this->assertSame(400, $this->controller->upsert_post_type($this->jsonRequest($body))->status);
    }

    public function test_upsert_maps_service_refusals(): void
    {
        $this->service->method('upsert')->willThrowException(new InvalidPostTypeException('reserved'));
        $this->assertSame(422, $this->controller->upsert_post_type($this->jsonRequest(['slug' => 'page', 'args' => []]))->status);
    }

    public function test_upsert_maps_a_stale_revision_to_412(): void
    {
        $this->service->method('upsert')->willThrowException(new StalePostTypeRevisionException('stale'));
        $this->assertSame(412, $this->controller->upsert_post_type($this->jsonRequest(['slug' => 'book', 'args' => [], 'expectedRevision' => 'x']))->status);
    }

    public function test_delete_returns_404_when_nothing_was_stored(): void
    {
        $this->service->method('delete')->willReturn(false);

        $this->assertSame(404, $this->controller->delete_post_type(new WP_REST_Request(['slug' => 'book']))->status);
    }
}
