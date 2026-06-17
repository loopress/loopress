<?php

namespace Loopress\RestApi;

use Loopress\Service\CustomPostTypeService;
use WP_REST_Request;
use WP_REST_Response;

class CustomPostTypeController
{
    public function __construct(private CustomPostTypeService $cptService) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/cpt/(?P<post_type>[a-z0-9_-]+)', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_posts'],
            'permission_callback' => fn() => current_user_can('manage_options'),
            'args'                => [
                'post_type' => [
                    'required'          => true,
                    'validate_callback' => fn($value) => post_type_exists($value),
                ],
            ],
        ]);

        register_rest_route('loopress/v1', '/cpt/(?P<post_type>[a-z0-9_-]+)/(?P<id>\d+)', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_post'],
            'permission_callback' => fn() => current_user_can('manage_options'),
            'args'                => [
                'post_type' => [
                    'required'          => true,
                    'validate_callback' => fn($value) => post_type_exists($value),
                ],
                'id' => [
                    'required'          => true,
                    'validate_callback' => fn($value) => is_numeric($value) && $value > 0,
                    'sanitize_callback' => 'absint',
                ],
            ],
        ]);
    }

    public function get_posts(WP_REST_Request $request): WP_REST_Response
    {
        $postType = $request->get_param('post_type');
        $posts    = $this->cptService->getPosts($postType);

        return new WP_REST_Response($posts, 200);
    }

    public function get_post(WP_REST_Request $request): WP_REST_Response
    {
        $postType = $request->get_param('post_type');
        $id       = $request->get_param('id');
        $post     = $this->cptService->getPost($postType, $id);

        if ($post === null) {
            return new WP_REST_Response(['error' => 'Post not found'], 404);
        }

        return new WP_REST_Response($post, 200);
    }
}
