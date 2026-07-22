<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Seo\RestApi;

use Brain\Monkey;
use Loopress\Seo\RestApi\SeoController;
use Loopress\Seo\Service\SeoService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class SeoControllerTest extends TestCase
{
    private SeoController $controller;
    private SeoService&MockObject $seoService;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->seoService = $this->createMock(SeoService::class);
        $this->controller = new SeoController($this->seoService);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── post-meta ───────────────────────────────────────────────────────────

    public function test_list_post_meta_returns_400_when_no_seo_plugin_is_active(): void
    {
        $this->seoService->method('isActive')->willReturn(false);
        $this->seoService->expects($this->never())->method('listPostMeta');

        $response = $this->controller->list_post_meta(new WP_REST_Request(['type' => 'post']));

        $this->assertSame(400, $response->status);
    }

    public function test_list_post_meta_returns_the_service_result(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('listPostMeta')->with('post')->willReturn([['slug' => 'hello']]);

        $response = $this->controller->list_post_meta(new WP_REST_Request(['type' => 'post']));

        $this->assertSame(200, $response->status);
        $this->assertSame([['slug' => 'hello']], $response->data);
    }

    public function test_list_post_meta_returns_500_on_runtime_exception(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('listPostMeta')->willThrowException(new \RuntimeException('boom'));

        $response = $this->controller->list_post_meta(new WP_REST_Request(['type' => 'post']));

        $this->assertSame(500, $response->status);
    }

    public function test_get_post_meta_returns_404_when_not_found(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('getPostMeta')->willReturn(null);

        $response = $this->controller->get_post_meta(new WP_REST_Request(['slug' => 'missing', 'type' => 'post']));

        $this->assertSame(404, $response->status);
    }

    public function test_get_post_meta_returns_200_with_the_post(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('getPostMeta')->with('post', 'hello')->willReturn(['slug' => 'hello']);

        $response = $this->controller->get_post_meta(new WP_REST_Request(['slug' => 'hello', 'type' => 'post']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['slug' => 'hello'], $response->data);
    }

    public function test_upsert_post_meta_returns_400_when_no_seo_plugin_is_active(): void
    {
        $this->seoService->method('isActive')->willReturn(false);
        $this->seoService->expects($this->never())->method('upsertPostMeta');

        $response = $this->controller->upsert_post_meta(new WP_REST_Request(['type' => 'post']));

        $this->assertSame(400, $response->status);
    }

    public function test_upsert_post_meta_returns_400_when_slug_or_meta_is_missing(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->expects($this->never())->method('upsertPostMeta');

        $response = $this->controller->upsert_post_meta(new WP_REST_Request(['type' => 'post']));

        $this->assertSame(400, $response->status);
    }

    public function test_upsert_post_meta_returns_500_on_runtime_exception(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('upsertPostMeta')->willThrowException(new \RuntimeException('boom'));

        $response = $this->controller->upsert_post_meta(new WP_REST_Request([
            'meta' => ['title' => 'x'],
            'slug' => 'hello',
            'type' => 'post',
        ]));

        $this->assertSame(500, $response->status);
    }

    public function test_upsert_post_meta_returns_200_with_the_upserted_post(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->expects($this->once())
            ->method('upsertPostMeta')
            ->with('post', 'hello', ['title' => 'New'])
            ->willReturn(['slug' => 'hello']);

        $response = $this->controller->upsert_post_meta(new WP_REST_Request([
            'meta' => ['title' => 'New'],
            'slug' => 'hello',
            'type' => 'post',
        ]));

        $this->assertSame(200, $response->status);
        $this->assertSame(['slug' => 'hello'], $response->data);
    }

    // ── settings ────────────────────────────────────────────────────────────

    public function test_get_settings_returns_400_when_no_seo_plugin_is_active(): void
    {
        $this->seoService->method('isActive')->willReturn(false);

        $response = $this->controller->get_settings();

        $this->assertSame(400, $response->status);
    }

    public function test_get_settings_returns_the_service_result(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('getSettings')->willReturn(['titleSeparator' => '-']);

        $response = $this->controller->get_settings();

        $this->assertSame(200, $response->status);
        $this->assertSame(['titleSeparator' => '-'], $response->data);
    }

    public function test_update_settings_returns_400_when_the_body_is_empty(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->expects($this->never())->method('updateSettings');

        $response = $this->controller->update_settings(new WP_REST_Request([]));

        $this->assertSame(400, $response->status);
    }

    public function test_update_settings_returns_200_with_the_updated_settings(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('updateSettings')->willReturn(['titleSeparator' => '|']);

        $response = $this->controller->update_settings(new WP_REST_Request(['titleSeparator' => '|']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['titleSeparator' => '|'], $response->data);
    }

    // ── redirects ───────────────────────────────────────────────────────────

    public function test_list_redirects_returns_400_when_no_seo_plugin_is_active(): void
    {
        $this->seoService->method('isActive')->willReturn(false);

        $response = $this->controller->list_redirects();

        $this->assertSame(400, $response->status);
    }

    public function test_list_redirects_returns_the_service_result(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('listRedirections')->willReturn([['id' => 1]]);

        $response = $this->controller->list_redirects();

        $this->assertSame(200, $response->status);
        $this->assertSame([['id' => 1]], $response->data);
    }

    // The active provider not supporting redirects (e.g. Yoast) surfaces as a RuntimeException
    // from the service, same as "no provider active" or "multiple active" — this just confirms
    // the controller maps it to a 500 like any other service-level failure, not a special code.
    public function test_list_redirects_returns_500_when_the_active_provider_does_not_support_redirects(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('listRedirections')->willThrowException(
            new \RuntimeException('Redirects are not supported by the active SEO plugin.'),
        );

        $response = $this->controller->list_redirects();

        $this->assertSame(500, $response->status);
    }

    public function test_get_redirect_returns_404_when_not_found(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('getRedirection')->willReturn(null);

        $response = $this->controller->get_redirect(new WP_REST_Request(['id' => '999']));

        $this->assertSame(404, $response->status);
    }

    public function test_get_redirect_returns_200_with_the_redirect(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('getRedirection')->with(7)->willReturn(['id' => 7]);

        $response = $this->controller->get_redirect(new WP_REST_Request(['id' => '7']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['id' => 7], $response->data);
    }

    public function test_create_redirect_returns_400_when_the_body_is_empty(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->expects($this->never())->method('createRedirection');

        $response = $this->controller->create_redirect(new WP_REST_Request([]));

        $this->assertSame(400, $response->status);
    }

    public function test_create_redirect_returns_201_with_the_created_redirect(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('createRedirection')->willReturn(['id' => 1, 'urlTo' => '/new']);

        $response = $this->controller->create_redirect(new WP_REST_Request(['urlTo' => '/new']));

        $this->assertSame(201, $response->status);
        $this->assertSame(['id' => 1, 'urlTo' => '/new'], $response->data);
    }

    public function test_update_redirect_returns_404_when_not_found(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('updateRedirection')->willReturn(null);

        $response = $this->controller->update_redirect(new WP_REST_Request(['id' => '999', 'status' => 'inactive']));

        $this->assertSame(404, $response->status);
    }

    public function test_update_redirect_returns_200_with_the_updated_redirect(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('updateRedirection')->with(1, $this->isType('array'))->willReturn(['id' => 1, 'status' => 'inactive']);

        $response = $this->controller->update_redirect(new WP_REST_Request(['id' => '1', 'status' => 'inactive']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['id' => 1, 'status' => 'inactive'], $response->data);
    }
}
