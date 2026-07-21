<?php

namespace Loopress\Tests\Unit\RestApi;

use Brain\Monkey;
use Loopress\RestApi\RankMathController;
use Loopress\Service\RankMathService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class RankMathControllerTest extends TestCase
{
    private RankMathService&MockObject $rankMathService;
    private RankMathController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->rankMathService = $this->createMock(RankMathService::class);
        $this->controller = new RankMathController($this->rankMathService);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── post-meta ───────────────────────────────────────────────────────────

    public function test_list_post_meta_returns_400_when_rank_math_is_not_active(): void
    {
        $this->rankMathService->method('isActive')->willReturn(false);
        $this->rankMathService->expects($this->never())->method('listPostMeta');

        $response = $this->controller->list_post_meta(new WP_REST_Request(['type' => 'post']));

        $this->assertSame(400, $response->status);
    }

    public function test_list_post_meta_returns_the_service_result(): void
    {
        $this->rankMathService->method('isActive')->willReturn(true);
        $this->rankMathService->method('listPostMeta')->with('post')->willReturn([['slug' => 'hello']]);

        $response = $this->controller->list_post_meta(new WP_REST_Request(['type' => 'post']));

        $this->assertSame(200, $response->status);
        $this->assertSame([['slug' => 'hello']], $response->data);
    }

    public function test_list_post_meta_returns_500_on_runtime_exception(): void
    {
        $this->rankMathService->method('isActive')->willReturn(true);
        $this->rankMathService->method('listPostMeta')->willThrowException(new \RuntimeException('boom'));

        $response = $this->controller->list_post_meta(new WP_REST_Request(['type' => 'post']));

        $this->assertSame(500, $response->status);
    }

    public function test_get_post_meta_returns_404_when_not_found(): void
    {
        $this->rankMathService->method('isActive')->willReturn(true);
        $this->rankMathService->method('getPostMeta')->willReturn(null);

        $response = $this->controller->get_post_meta(new WP_REST_Request(['slug' => 'missing', 'type' => 'post']));

        $this->assertSame(404, $response->status);
    }

    public function test_get_post_meta_returns_200_with_the_post(): void
    {
        $this->rankMathService->method('isActive')->willReturn(true);
        $this->rankMathService->method('getPostMeta')->with('post', 'hello')->willReturn(['slug' => 'hello']);

        $response = $this->controller->get_post_meta(new WP_REST_Request(['slug' => 'hello', 'type' => 'post']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['slug' => 'hello'], $response->data);
    }

    public function test_upsert_post_meta_returns_400_when_rank_math_is_not_active(): void
    {
        $this->rankMathService->method('isActive')->willReturn(false);
        $this->rankMathService->expects($this->never())->method('upsertPostMeta');

        $response = $this->controller->upsert_post_meta(new WP_REST_Request(['type' => 'post']));

        $this->assertSame(400, $response->status);
    }

    public function test_upsert_post_meta_returns_400_when_slug_or_meta_is_missing(): void
    {
        $this->rankMathService->method('isActive')->willReturn(true);
        $this->rankMathService->expects($this->never())->method('upsertPostMeta');

        $response = $this->controller->upsert_post_meta(new WP_REST_Request(['type' => 'post']));

        $this->assertSame(400, $response->status);
    }

    public function test_upsert_post_meta_returns_500_on_runtime_exception(): void
    {
        $this->rankMathService->method('isActive')->willReturn(true);
        $this->rankMathService->method('upsertPostMeta')->willThrowException(new \RuntimeException('boom'));

        $response = $this->controller->upsert_post_meta(new WP_REST_Request([
            'meta' => ['rank_math_title' => 'x'],
            'slug' => 'hello',
            'type' => 'post',
        ]));

        $this->assertSame(500, $response->status);
    }

    public function test_upsert_post_meta_returns_200_with_the_upserted_post(): void
    {
        $this->rankMathService->method('isActive')->willReturn(true);
        $this->rankMathService->expects($this->once())
            ->method('upsertPostMeta')
            ->with('post', 'hello', ['rank_math_title' => 'New'])
            ->willReturn(['slug' => 'hello']);

        $response = $this->controller->upsert_post_meta(new WP_REST_Request([
            'meta' => ['rank_math_title' => 'New'],
            'slug' => 'hello',
            'type' => 'post',
        ]));

        $this->assertSame(200, $response->status);
        $this->assertSame(['slug' => 'hello'], $response->data);
    }

    // ── settings ────────────────────────────────────────────────────────────

    public function test_get_settings_returns_400_when_rank_math_is_not_active(): void
    {
        $this->rankMathService->method('isActive')->willReturn(false);

        $response = $this->controller->get_settings();

        $this->assertSame(400, $response->status);
    }

    public function test_get_settings_returns_the_service_result(): void
    {
        $this->rankMathService->method('isActive')->willReturn(true);
        $this->rankMathService->method('getSettings')->willReturn(['titleSeparator' => '-']);

        $response = $this->controller->get_settings();

        $this->assertSame(200, $response->status);
        $this->assertSame(['titleSeparator' => '-'], $response->data);
    }

    public function test_update_settings_returns_400_when_the_body_is_empty(): void
    {
        $this->rankMathService->method('isActive')->willReturn(true);
        $this->rankMathService->expects($this->never())->method('updateSettings');

        $response = $this->controller->update_settings(new WP_REST_Request([]));

        $this->assertSame(400, $response->status);
    }

    public function test_update_settings_returns_200_with_the_updated_settings(): void
    {
        $this->rankMathService->method('isActive')->willReturn(true);
        $this->rankMathService->method('updateSettings')->willReturn(['titleSeparator' => '|']);

        $response = $this->controller->update_settings(new WP_REST_Request(['titleSeparator' => '|']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['titleSeparator' => '|'], $response->data);
    }

    // ── redirects ───────────────────────────────────────────────────────────

    public function test_list_redirects_returns_400_when_rank_math_is_not_active(): void
    {
        $this->rankMathService->method('isActive')->willReturn(false);

        $response = $this->controller->list_redirects();

        $this->assertSame(400, $response->status);
    }

    public function test_list_redirects_returns_the_service_result(): void
    {
        $this->rankMathService->method('isActive')->willReturn(true);
        $this->rankMathService->method('listRedirections')->willReturn([['id' => 1]]);

        $response = $this->controller->list_redirects();

        $this->assertSame(200, $response->status);
        $this->assertSame([['id' => 1]], $response->data);
    }

    public function test_get_redirect_returns_404_when_not_found(): void
    {
        $this->rankMathService->method('isActive')->willReturn(true);
        $this->rankMathService->method('getRedirection')->willReturn(null);

        $response = $this->controller->get_redirect(new WP_REST_Request(['id' => '999']));

        $this->assertSame(404, $response->status);
    }

    public function test_get_redirect_returns_200_with_the_redirect(): void
    {
        $this->rankMathService->method('isActive')->willReturn(true);
        $this->rankMathService->method('getRedirection')->with(7)->willReturn(['id' => 7]);

        $response = $this->controller->get_redirect(new WP_REST_Request(['id' => '7']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['id' => 7], $response->data);
    }

    public function test_create_redirect_returns_400_when_the_body_is_empty(): void
    {
        $this->rankMathService->method('isActive')->willReturn(true);
        $this->rankMathService->expects($this->never())->method('createRedirection');

        $response = $this->controller->create_redirect(new WP_REST_Request([]));

        $this->assertSame(400, $response->status);
    }

    public function test_create_redirect_returns_201_with_the_created_redirect(): void
    {
        $this->rankMathService->method('isActive')->willReturn(true);
        $this->rankMathService->method('createRedirection')->willReturn(['id' => 1, 'urlTo' => '/new']);

        $response = $this->controller->create_redirect(new WP_REST_Request(['urlTo' => '/new']));

        $this->assertSame(201, $response->status);
        $this->assertSame(['id' => 1, 'urlTo' => '/new'], $response->data);
    }

    public function test_update_redirect_returns_404_when_not_found(): void
    {
        $this->rankMathService->method('isActive')->willReturn(true);
        $this->rankMathService->method('updateRedirection')->willReturn(null);

        $response = $this->controller->update_redirect(new WP_REST_Request(['id' => '999', 'status' => 'inactive']));

        $this->assertSame(404, $response->status);
    }

    public function test_update_redirect_returns_200_with_the_updated_redirect(): void
    {
        $this->rankMathService->method('isActive')->willReturn(true);
        $this->rankMathService->method('updateRedirection')->with(1, $this->isType('array'))->willReturn(['id' => 1, 'status' => 'inactive']);

        $response = $this->controller->update_redirect(new WP_REST_Request(['id' => '1', 'status' => 'inactive']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['id' => 1, 'status' => 'inactive'], $response->data);
    }
}
