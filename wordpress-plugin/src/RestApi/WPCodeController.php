<?php

namespace Loopress\RestApi;

use Loopress\Service\WPCodeService;
use WP_REST_Request;
use WP_REST_Response;

class WPCodeController
{
    public function __construct(private WPCodeService $wpCodeService) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/wpcode/snippets', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_snippets'],
                'permission_callback' => fn() => current_user_can('manage_options'),
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'create_snippet'],
                'permission_callback' => fn() => current_user_can('manage_options'),
            ],
        ]);

        register_rest_route('loopress/v1', '/wpcode/snippets/(?P<id>\d+)', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_snippet'],
                'permission_callback' => fn() => current_user_can('manage_options'),
                'args'                => $this->idArg(),
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'update_snippet'],
                'permission_callback' => fn() => current_user_can('manage_options'),
                'args'                => $this->idArg(),
            ],
        ]);
    }

    public function get_snippets(): WP_REST_Response
    {
        if (!$this->wpCodeService->isWPCodeActive()) {
            return new WP_REST_Response(['error' => 'WPCode plugin is not active'], 400);
        }

        return new WP_REST_Response($this->wpCodeService->getSnippets(), 200);
    }

    public function get_snippet(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->wpCodeService->isWPCodeActive()) {
            return new WP_REST_Response(['error' => 'WPCode plugin is not active'], 400);
        }

        $snippet = $this->wpCodeService->getSnippet((int) $request->get_param('id'));

        if ($snippet === null) {
            return new WP_REST_Response(['error' => 'Snippet not found'], 404);
        }

        return new WP_REST_Response($snippet, 200);
    }

    public function create_snippet(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->wpCodeService->isWPCodeActive()) {
            return new WP_REST_Response(['error' => 'WPCode plugin is not active'], 400);
        }

        $data = $request->get_json_params();

        if (empty($data['title']) || empty($data['code'])) {
            return new WP_REST_Response(['error' => 'Missing required fields: title, code'], 400);
        }

        $snippet = $this->wpCodeService->createSnippet($data);

        return new WP_REST_Response($snippet, 201);
    }

    public function update_snippet(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->wpCodeService->isWPCodeActive()) {
            return new WP_REST_Response(['error' => 'WPCode plugin is not active'], 400);
        }

        $snippet = $this->wpCodeService->updateSnippet(
            (int) $request->get_param('id'),
            $request->get_json_params() ?? [],
        );

        if ($snippet === null) {
            return new WP_REST_Response(['error' => 'Snippet not found'], 404);
        }

        return new WP_REST_Response($snippet, 200);
    }

    /** @return array<string, mixed>[] */
    private function idArg(): array
    {
        return [
            'id' => [
                'required'          => true,
                'sanitize_callback' => 'absint',
                'validate_callback' => fn($v) => is_numeric($v) && $v > 0,
            ],
        ];
    }
}
