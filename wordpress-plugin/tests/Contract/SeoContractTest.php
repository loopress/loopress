<?php

declare(strict_types=1);

namespace Loopress\Tests\Contract;

use Brain\Monkey;
use Loopress\Seo\RestApi\SeoController;
use Loopress\Seo\Service\SeoService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class SeoContractTest extends TestCase
{
    use AssertsJsonSchema;

    private SeoService&MockObject $seoService;
    private SeoController $controller;

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

    private function fakePostMeta(): array
    {
        return ['meta' => ['_yoast_wpseo_title' => 'Hello'], 'slug' => 'hello', 'title' => 'Hello'];
    }

    private function fakeRedirect(): array
    {
        return [
            'id'         => 1,
            'urlTo'      => '/new',
            'headerCode' => 301,
            'status'     => 'active',
            'hits'       => 0,
            'sources'    => [['comparison' => 'exact', 'pattern' => '/old']],
            'createdAt'  => '2026-01-01 00:00:00',
            'updatedAt'  => '2026-01-01 00:00:00',
        ];
    }

    // ── post-meta ────────────────────────────────────────────────────────────

    public function test_list_post_meta_response_matches_schema(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('listPostMeta')->willReturn([$this->fakePostMeta()]);

        $response = $this->controller->list_post_meta(new WP_REST_Request(['type' => 'post']));

        $this->assertMatchesSchema('seo-post-meta-list.schema.json', $response->data);
    }

    public function test_get_post_meta_response_matches_schema(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('getPostMeta')->willReturn($this->fakePostMeta());

        $response = $this->controller->get_post_meta(new WP_REST_Request(['type' => 'post', 'slug' => 'hello']));

        $this->assertMatchesSchema('seo-post-meta.schema.json', $response->data);
    }

    public function test_upsert_post_meta_response_matches_schema(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('upsertPostMeta')->willReturn($this->fakePostMeta());

        $request = new WP_REST_Request(['type' => 'post', 'slug' => 'hello', 'meta' => ['_yoast_wpseo_title' => 'New']]);
        $response = $this->controller->upsert_post_meta($request);

        $this->assertMatchesSchema('seo-post-meta.schema.json', $response->data);
    }

    // ── settings ─────────────────────────────────────────────────────────────

    public function test_get_settings_response_matches_schema(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('getSettings')->willReturn(['titleSeparator' => '-']);

        $response = $this->controller->get_settings();

        $this->assertMatchesSchema('seo-settings.schema.json', $response->data);
    }

    public function test_update_settings_response_matches_schema(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('updateSettings')->willReturn(['titleSeparator' => '|']);

        $response = $this->controller->update_settings(new WP_REST_Request(['titleSeparator' => '|']));

        $this->assertMatchesSchema('seo-settings.schema.json', $response->data);
    }

    // ── redirects ────────────────────────────────────────────────────────────

    public function test_list_redirects_response_matches_schema(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('listRedirections')->willReturn([$this->fakeRedirect()]);

        $response = $this->controller->list_redirects();

        $this->assertMatchesSchema('seo-redirect-list.schema.json', $response->data);
    }

    public function test_get_redirect_response_matches_schema(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('getRedirection')->willReturn($this->fakeRedirect());

        $response = $this->controller->get_redirect(new WP_REST_Request(['id' => '1']));

        $this->assertMatchesSchema('seo-redirect.schema.json', $response->data);
    }

    public function test_create_redirect_response_matches_schema(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('createRedirection')->willReturn($this->fakeRedirect());

        $response = $this->controller->create_redirect(new WP_REST_Request(['urlTo' => '/new']));

        $this->assertMatchesSchema('seo-redirect.schema.json', $response->data);
    }

    public function test_update_redirect_response_matches_schema(): void
    {
        $this->seoService->method('isActive')->willReturn(true);
        $this->seoService->method('updateRedirection')->willReturn($this->fakeRedirect());

        $response = $this->controller->update_redirect(new WP_REST_Request(['id' => '1', 'status' => 'inactive']));

        $this->assertMatchesSchema('seo-redirect.schema.json', $response->data);
    }
}
