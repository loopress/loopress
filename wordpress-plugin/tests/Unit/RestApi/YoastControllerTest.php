<?php

namespace Loopress\Tests\Unit\RestApi;

use Brain\Monkey;
use Loopress\RestApi\YoastController;
use Loopress\Service\YoastService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class YoastControllerTest extends TestCase
{
    private YoastController $controller;
    private YoastService&MockObject $yoastService;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->yoastService = $this->createMock(YoastService::class);
        $this->controller = new YoastController($this->yoastService);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── post-meta ───────────────────────────────────────────────────────────

    public function test_list_post_meta_returns_400_when_yoast_is_not_active(): void
    {
        $this->yoastService->method('isActive')->willReturn(false);
        $this->yoastService->expects($this->never())->method('listPostMeta');

        $response = $this->controller->list_post_meta(new WP_REST_Request(['type' => 'post']));

        $this->assertSame(400, $response->status);
    }

    public function test_list_post_meta_returns_the_service_result(): void
    {
        $this->yoastService->method('isActive')->willReturn(true);
        $this->yoastService->method('listPostMeta')->with('post')->willReturn([['slug' => 'hello']]);

        $response = $this->controller->list_post_meta(new WP_REST_Request(['type' => 'post']));

        $this->assertSame(200, $response->status);
        $this->assertSame([['slug' => 'hello']], $response->data);
    }

    public function test_list_post_meta_returns_500_on_runtime_exception(): void
    {
        $this->yoastService->method('isActive')->willReturn(true);
        $this->yoastService->method('listPostMeta')->willThrowException(new \RuntimeException('boom'));

        $response = $this->controller->list_post_meta(new WP_REST_Request(['type' => 'post']));

        $this->assertSame(500, $response->status);
    }

    public function test_get_post_meta_returns_404_when_not_found(): void
    {
        $this->yoastService->method('isActive')->willReturn(true);
        $this->yoastService->method('getPostMeta')->willReturn(null);

        $response = $this->controller->get_post_meta(new WP_REST_Request(['slug' => 'missing', 'type' => 'post']));

        $this->assertSame(404, $response->status);
    }

    public function test_get_post_meta_returns_200_with_the_post(): void
    {
        $this->yoastService->method('isActive')->willReturn(true);
        $this->yoastService->method('getPostMeta')->with('post', 'hello')->willReturn(['slug' => 'hello']);

        $response = $this->controller->get_post_meta(new WP_REST_Request(['slug' => 'hello', 'type' => 'post']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['slug' => 'hello'], $response->data);
    }

    public function test_upsert_post_meta_returns_400_when_yoast_is_not_active(): void
    {
        $this->yoastService->method('isActive')->willReturn(false);
        $this->yoastService->expects($this->never())->method('upsertPostMeta');

        $response = $this->controller->upsert_post_meta(new WP_REST_Request(['type' => 'post']));

        $this->assertSame(400, $response->status);
    }

    public function test_upsert_post_meta_returns_400_when_slug_or_meta_is_missing(): void
    {
        $this->yoastService->method('isActive')->willReturn(true);
        $this->yoastService->expects($this->never())->method('upsertPostMeta');

        $response = $this->controller->upsert_post_meta(new WP_REST_Request(['type' => 'post']));

        $this->assertSame(400, $response->status);
    }

    public function test_upsert_post_meta_returns_500_on_runtime_exception(): void
    {
        $this->yoastService->method('isActive')->willReturn(true);
        $this->yoastService->method('upsertPostMeta')->willThrowException(new \RuntimeException('boom'));

        $response = $this->controller->upsert_post_meta(new WP_REST_Request([
            'meta' => ['_yoast_wpseo_title' => 'x'],
            'slug' => 'hello',
            'type' => 'post',
        ]));

        $this->assertSame(500, $response->status);
    }

    public function test_upsert_post_meta_returns_200_with_the_upserted_post(): void
    {
        $this->yoastService->method('isActive')->willReturn(true);
        $this->yoastService->expects($this->once())
            ->method('upsertPostMeta')
            ->with('post', 'hello', ['_yoast_wpseo_title' => 'New'])
            ->willReturn(['slug' => 'hello']);

        $response = $this->controller->upsert_post_meta(new WP_REST_Request([
            'meta' => ['_yoast_wpseo_title' => 'New'],
            'slug' => 'hello',
            'type' => 'post',
        ]));

        $this->assertSame(200, $response->status);
        $this->assertSame(['slug' => 'hello'], $response->data);
    }

    // ── settings ────────────────────────────────────────────────────────────

    public function test_get_settings_returns_400_when_yoast_is_not_active(): void
    {
        $this->yoastService->method('isActive')->willReturn(false);

        $response = $this->controller->get_settings();

        $this->assertSame(400, $response->status);
    }

    public function test_get_settings_returns_the_service_result(): void
    {
        $this->yoastService->method('isActive')->willReturn(true);
        $this->yoastService->method('getSettings')->willReturn(['title_separator' => '-']);

        $response = $this->controller->get_settings();

        $this->assertSame(200, $response->status);
        $this->assertSame(['title_separator' => '-'], $response->data);
    }

    public function test_update_settings_returns_400_when_the_body_is_empty(): void
    {
        $this->yoastService->method('isActive')->willReturn(true);
        $this->yoastService->expects($this->never())->method('updateSettings');

        $response = $this->controller->update_settings(new WP_REST_Request([]));

        $this->assertSame(400, $response->status);
    }

    public function test_update_settings_returns_200_with_the_updated_settings(): void
    {
        $this->yoastService->method('isActive')->willReturn(true);
        $this->yoastService->method('updateSettings')->willReturn(['title_separator' => '|']);

        $response = $this->controller->update_settings(new WP_REST_Request(['title_separator' => '|']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['title_separator' => '|'], $response->data);
    }
}
