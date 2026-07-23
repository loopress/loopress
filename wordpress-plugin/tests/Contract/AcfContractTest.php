<?php

declare(strict_types=1);

namespace Loopress\Tests\Contract;

use Brain\Monkey;
use Loopress\Acf\RestApi\AcfController;
use Loopress\Acf\Service\AcfService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class AcfContractTest extends TestCase
{
    use AssertsJsonSchema;

    private AcfService&MockObject $acfService;
    private AcfController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->acfService = $this->createMock(AcfService::class);
        $this->controller = new AcfController($this->acfService);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_list_objects_response_matches_schema(): void
    {
        $this->acfService->method('isActive')->willReturn(true);
        $this->acfService->method('list')->willReturn([
            ['key' => 'group_1', 'title' => 'Group One', 'fields' => []],
        ]);

        $response = $this->controller->list_objects(new WP_REST_Request(['type' => 'field-groups']));

        $this->assertMatchesSchema('acf-object-list.schema.json', $response->data);
    }

    public function test_get_object_response_matches_schema(): void
    {
        $this->acfService->method('isActive')->willReturn(true);
        $this->acfService->method('get')->willReturn(['key' => 'taxonomy_1', 'title' => 'Genre']);

        $response = $this->controller->get_object(new WP_REST_Request(['type' => 'taxonomies', 'key' => 'taxonomy_1']));

        $this->assertMatchesSchema('acf-object.schema.json', $response->data);
    }

    public function test_upsert_object_response_matches_schema(): void
    {
        $this->acfService->method('isActive')->willReturn(true);
        $this->acfService->method('upsert')->willReturn(['key' => 'post_type_1', 'title' => 'Book']);

        $request = new WP_REST_Request(['type' => 'post-types', 'key' => 'post_type_1']);
        $response = $this->controller->upsert_object($request);

        $this->assertMatchesSchema('acf-object.schema.json', $response->data);
    }

    // delete_object returns 204 with a null body: no JSON shape to validate against a schema.
}
