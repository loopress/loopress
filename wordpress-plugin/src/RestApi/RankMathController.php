<?php

namespace Loopress\RestApi;

use Loopress\Service\RankMathService;
use WP_REST_Request;
use WP_REST_Response;

class RankMathController
{
    public function __construct(private RankMathService $rankMathService) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/rankmath/post-meta/(?P<type>[a-z0-9_-]+)', [
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

        register_rest_route('loopress/v1', '/rankmath/post-meta/(?P<type>[a-z0-9_-]+)/(?P<slug>[^/]+)', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_post_meta'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);

        register_rest_route('loopress/v1', '/rankmath/settings', [
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

        register_rest_route('loopress/v1', '/rankmath/redirects', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'list_redirects'],
                'permission_callback' => fn() => current_user_can('manage_options'),
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'create_redirect'],
                'permission_callback' => fn() => current_user_can('manage_options'),
            ],
        ]);

        register_rest_route('loopress/v1', '/rankmath/redirects/(?P<id>\d+)', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_redirect'],
                'permission_callback' => fn() => current_user_can('manage_options'),
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'update_redirect'],
                'permission_callback' => fn() => current_user_can('manage_options'),
            ],
        ]);
    }

    // ── post-meta ───────────────────────────────────────────────────────────

    public function list_post_meta(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->rankMathService->isActive()) {
            return $this->inactiveResponse();
        }

        try {
            return new WP_REST_Response($this->rankMathService->listPostMeta((string) $request->get_param('type')), 200);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }
    }

    public function get_post_meta(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->rankMathService->isActive()) {
            return $this->inactiveResponse();
        }

        $post = $this->rankMathService->getPostMeta((string) $request->get_param('type'), (string) $request->get_param('slug'));

        return $post === null
            ? new WP_REST_Response(['error' => 'Post not found'], 404)
            : new WP_REST_Response($post, 200);
    }

    public function upsert_post_meta(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->rankMathService->isActive()) {
            return $this->inactiveResponse();
        }

        $body = $request->get_json_params();
        $slug = (string) ($body['slug'] ?? '');
        $meta = $body['meta'] ?? null;

        if ($slug === '' || !is_array($meta)) {
            return new WP_REST_Response(['error' => 'Request body must include a non-empty "slug" and a "meta" object.'], 400);
        }

        try {
            $post = $this->rankMathService->upsertPostMeta((string) $request->get_param('type'), $slug, $meta);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        return new WP_REST_Response($post, 200);
    }

    // ── settings ────────────────────────────────────────────────────────────

    public function get_settings(): WP_REST_Response
    {
        if (!$this->rankMathService->isActive()) {
            return $this->inactiveResponse();
        }

        return new WP_REST_Response($this->rankMathService->getSettings(), 200);
    }

    public function update_settings(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->rankMathService->isActive()) {
            return $this->inactiveResponse();
        }

        $data = $request->get_json_params();
        if ($data === []) {
            return new WP_REST_Response(['error' => 'Request body must be a non-empty JSON object.'], 400);
        }

        return new WP_REST_Response($this->rankMathService->updateSettings($data), 200);
    }

    // ── redirects ───────────────────────────────────────────────────────────

    public function list_redirects(): WP_REST_Response
    {
        if (!$this->rankMathService->isActive()) {
            return $this->inactiveResponse();
        }

        try {
            return new WP_REST_Response($this->rankMathService->listRedirections(), 200);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }
    }

    public function get_redirect(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->rankMathService->isActive()) {
            return $this->inactiveResponse();
        }

        try {
            $redirect = $this->rankMathService->getRedirection((int) $request->get_param('id'));
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        return $redirect === null
            ? new WP_REST_Response(['error' => 'Redirect not found'], 404)
            : new WP_REST_Response($redirect, 200);
    }

    public function create_redirect(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->rankMathService->isActive()) {
            return $this->inactiveResponse();
        }

        $data = $request->get_json_params();
        if ($data === []) {
            return new WP_REST_Response(['error' => 'Request body must be a non-empty JSON object.'], 400);
        }

        try {
            $redirect = $this->rankMathService->createRedirection($data);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        return new WP_REST_Response($redirect, 201);
    }

    public function update_redirect(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->rankMathService->isActive()) {
            return $this->inactiveResponse();
        }

        $data = $request->get_json_params();

        try {
            $redirect = $this->rankMathService->updateRedirection((int) $request->get_param('id'), $data);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        return $redirect === null
            ? new WP_REST_Response(['error' => 'Redirect not found'], 404)
            : new WP_REST_Response($redirect, 200);
    }

    private function inactiveResponse(): WP_REST_Response
    {
        return new WP_REST_Response(['error' => 'RankMath is not active'], 400);
    }
}
