<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Acf\RestApi;

use Brain\Monkey;
use Loopress\Acf\RestApi\AcfController;
use Loopress\Acf\Service\AcfService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class AcfControllerTest extends TestCase
{
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

    /** @return mixed */
    private function invokePrivate(string $method, mixed ...$args): mixed
    {
        $ref = new \ReflectionMethod(AcfController::class, $method);
        $ref->setAccessible(true);
        return $ref->invoke($this->controller, ...$args);
    }

    // ── typeArg / keyArg ─────────────────────────────────────────────────────

    public function test_type_arg_enumerates_the_four_url_slugs(): void
    {
        $arg = $this->invokePrivate('typeArg');
        $this->assertEqualsCanonicalizing(
            ['field-groups', 'post-types', 'taxonomies', 'options-pages'],
            $arg['type']['enum'],
        );
    }

    public function test_key_arg_validate_callback_rejects_an_empty_string(): void
    {
        $validate = $this->invokePrivate('keyArg')['key']['validate_callback'];
        $this->assertFalse($validate(''));
        $this->assertTrue($validate('group_123'));
    }

    // ── list_objects ─────────────────────────────────────────────────────────

    public function test_list_returns_400_when_acf_is_not_active(): void
    {
        $this->acfService->method('isActive')->willReturn(false);
        $this->acfService->expects($this->never())->method('list');

        $response = $this->controller->list_objects(new WP_REST_Request(['type' => 'field-groups']));

        $this->assertSame(400, $response->status);
    }

    public function test_list_returns_objects_for_the_resolved_type(): void
    {
        $this->acfService->method('isActive')->willReturn(true);
        $this->acfService->method('list')->with('acf-field-group')->willReturn([['key' => 'group_1']]);

        $response = $this->controller->list_objects(new WP_REST_Request(['type' => 'field-groups']));

        $this->assertSame(200, $response->status);
        $this->assertSame([['key' => 'group_1']], $response->data);
    }

    public function test_list_returns_500_on_runtime_exception(): void
    {
        $this->acfService->method('isActive')->willReturn(true);
        $this->acfService->method('list')->willThrowException(new \RuntimeException('ACF PRO required.'));

        $response = $this->controller->list_objects(new WP_REST_Request(['type' => 'options-pages']));

        $this->assertSame(500, $response->status);
    }

    // ── get_object ───────────────────────────────────────────────────────────

    public function test_get_returns_404_when_object_not_found(): void
    {
        $this->acfService->method('isActive')->willReturn(true);
        $this->acfService->method('get')->willReturn(null);

        $response = $this->controller->get_object(new WP_REST_Request(['type' => 'taxonomies', 'key' => 'taxonomy_missing']));

        $this->assertSame(404, $response->status);
    }

    public function test_get_returns_200_with_the_object(): void
    {
        $this->acfService->method('isActive')->willReturn(true);
        $this->acfService->method('get')->with('acf-taxonomy', 'taxonomy_1')->willReturn(['key' => 'taxonomy_1']);

        $response = $this->controller->get_object(new WP_REST_Request(['type' => 'taxonomies', 'key' => 'taxonomy_1']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['key' => 'taxonomy_1'], $response->data);
    }

    // ── upsert_object ────────────────────────────────────────────────────────

    public function test_upsert_returns_400_when_acf_is_not_active(): void
    {
        $this->acfService->method('isActive')->willReturn(false);
        $this->acfService->expects($this->never())->method('upsert');

        $response = $this->controller->upsert_object(new WP_REST_Request(['type' => 'post-types']));

        $this->assertSame(400, $response->status);
    }

    public function test_upsert_returns_500_on_runtime_exception_from_service(): void
    {
        $this->acfService->method('isActive')->willReturn(true);
        $this->acfService->method('upsert')->willThrowException(new \RuntimeException('Missing key.'));

        $request = new WP_REST_Request(['type' => 'post-types']);
        $request->set_param('key', 'post_type_1');
        $response = $this->controller->upsert_object($request);

        $this->assertSame(500, $response->status);
    }

    public function test_upsert_returns_200_with_the_upserted_object(): void
    {
        // The lightweight WP_REST_Request stub doesn't separate route params from the JSON
        // body the way the real class does, so this only pins down the resolved post type
        // (the first argument), not the exact body shape passed through as the second.
        $this->acfService->method('isActive')->willReturn(true);
        $this->acfService->expects($this->once())
            ->method('upsert')
            ->with('acf-post-type', $this->isType('array'))
            ->willReturn(['key' => 'post_type_1']);

        $request = new WP_REST_Request(['type' => 'post-types', 'key' => 'post_type_1']);
        $response = $this->controller->upsert_object($request);

        $this->assertSame(200, $response->status);
        $this->assertSame(['key' => 'post_type_1'], $response->data);
    }

    // ── delete_object ────────────────────────────────────────────────────────

    public function test_delete_returns_204_on_success(): void
    {
        $this->acfService->method('isActive')->willReturn(true);
        $this->acfService->method('delete')->with('acf-taxonomy', 'taxonomy_1')->willReturn(true);

        $response = $this->controller->delete_object(new WP_REST_Request(['type' => 'taxonomies', 'key' => 'taxonomy_1']));

        $this->assertSame(204, $response->status);
    }

    public function test_delete_returns_404_when_object_not_found(): void
    {
        $this->acfService->method('isActive')->willReturn(true);
        $this->acfService->method('delete')->willReturn(false);

        $response = $this->controller->delete_object(new WP_REST_Request(['type' => 'taxonomies', 'key' => 'taxonomy_missing']));

        $this->assertSame(404, $response->status);
    }
}
