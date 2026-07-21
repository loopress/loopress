<?php

namespace Loopress\RestApi;

use Loopress\Service\YoastService;
use WP_REST_Request;
use WP_REST_Response;

class YoastController
{
    public function __construct(private YoastService $yoastService) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/yoast/post-meta/(?P<type>[a-z0-9_-]+)', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'list_post_meta'],
                'permission_callback' => fn() => current_user_can('manage_options'),
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'upsert_post_meta'],
                'permission_callback' => fn() => current_user_can('manage_options'),
            ],
        ]);

        register_rest_route('loopress/v1', '/yoast/post-meta/(?P<type>[a-z0-9_-]+)/(?P<slug>[^/]+)', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_post_meta'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);

        register_rest_route('loopress/v1', '/yoast/settings', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_settings'],
                'permission_callback' => fn() => current_user_can('manage_options'),
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'update_settings'],
                'permission_callback' => fn() => current_user_can('manage_options'),
            ],
        ]);
    }

    public function list_post_meta(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->yoastService->isActive()) {
            return $this->inactiveResponse();
        }

        try {
            return new WP_REST_Response($this->yoastService->listPostMeta((string) $request->get_param('type')), 200);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }
    }

    public function get_post_meta(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->yoastService->isActive()) {
            return $this->inactiveResponse();
        }

        $post = $this->yoastService->getPostMeta((string) $request->get_param('type'), (string) $request->get_param('slug'));

        return $post === null
            ? new WP_REST_Response(['error' => 'Post not found'], 404)
            : new WP_REST_Response($post, 200);
    }

    public function upsert_post_meta(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->yoastService->isActive()) {
            return $this->inactiveResponse();
        }

        $body = $request->get_json_params();
        $slug = (string) ($body['slug'] ?? '');
        $meta = $body['meta'] ?? null;

        if ($slug === '' || !is_array($meta)) {
            return new WP_REST_Response(['error' => 'Request body must include a non-empty "slug" and a "meta" object.'], 400);
        }

        try {
            $post = $this->yoastService->upsertPostMeta((string) $request->get_param('type'), $slug, $meta);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        return new WP_REST_Response($post, 200);
    }

    public function get_settings(): WP_REST_Response
    {
        if (!$this->yoastService->isActive()) {
            return $this->inactiveResponse();
        }

        return new WP_REST_Response($this->yoastService->getSettings(), 200);
    }

    public function update_settings(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->yoastService->isActive()) {
            return $this->inactiveResponse();
        }

        $data = $request->get_json_params();
        if ($data === []) {
            return new WP_REST_Response(['error' => 'Request body must be a non-empty JSON object.'], 400);
        }

        return new WP_REST_Response($this->yoastService->updateSettings($data), 200);
    }

    private function inactiveResponse(): WP_REST_Response
    {
        return new WP_REST_Response(['error' => 'Yoast SEO is not active'], 400);
    }
}
