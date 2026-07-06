<?php

namespace Loopress\RestApi;

use Loopress\Service\SnippetService;
use WP_REST_Request;
use WP_REST_Response;

class SnippetController
{
    /**
     * Canonical snippet locations, shared across every supported snippet plugin.
     * Each SnippetProvider translates these to/from its own backend's vocabulary.
     *
     * @var string[]
     */
    private const LOCATIONS = ['admin', 'body', 'everywhere', 'footer', 'frontend', 'header', 'once'];

    public function __construct(private SnippetService $snippetService) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/snippets', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_snippets'],
                'permission_callback' => fn() => current_user_can('manage_options'),
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'create_snippet'],
                'permission_callback' => fn() => current_user_can('manage_options'),
                'args'                => [
                    'name'                 => ['required' => true,  'type' => 'string'],
                    'code'                 => ['required' => true,  'type' => 'string'],
                    'type'                 => ['required' => false, 'type' => 'string', 'default' => 'php', 'enum' => ['php', 'js', 'css', 'html', 'text']],
                    'active'               => ['required' => false, 'type' => 'boolean', 'default' => false],
                    'description'          => ['required' => false, 'type' => 'string',  'default' => ''],
                    'tags'                 => ['required' => false, 'type' => 'array',   'default' => [], 'items' => ['type' => 'string']],
                    'location'             => ['required' => false, 'type' => 'string', 'enum' => self::LOCATIONS],
                    'insertMethod'         => ['required' => false, 'type' => 'string', 'default' => 'auto', 'enum' => ['auto', 'shortcode']],
                    'priority'             => ['required' => false, 'type' => 'integer', 'default' => 10],
                    'shortcodeAttributes'  => ['required' => false, 'type' => 'array', 'default' => [], 'items' => ['type' => 'string']],
                ],
            ],
        ]);

        register_rest_route('loopress/v1', '/snippets/(?P<id>\d+)', [
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
                'args'                => array_merge($this->idArg(), [
                    'name'                 => ['required' => false, 'type' => 'string'],
                    'code'                 => ['required' => false, 'type' => 'string'],
                    'type'                 => ['required' => false, 'type' => 'string', 'enum' => ['php', 'js', 'css', 'html', 'text']],
                    'active'               => ['required' => false, 'type' => 'boolean'],
                    'description'          => ['required' => false, 'type' => 'string'],
                    'tags'                 => ['required' => false, 'type' => 'array', 'items' => ['type' => 'string']],
                    'location'             => ['required' => false, 'type' => 'string', 'enum' => self::LOCATIONS],
                    'insertMethod'         => ['required' => false, 'type' => 'string', 'enum' => ['auto', 'shortcode']],
                    'priority'             => ['required' => false, 'type' => 'integer'],
                    'shortcodeAttributes'  => ['required' => false, 'type' => 'array', 'items' => ['type' => 'string']],
                ]),
            ],
        ]);
    }

    public function get_snippets(): WP_REST_Response
    {
        if (!$this->snippetService->isActive()) {
            return new WP_REST_Response(['error' => 'No supported snippet plugin is active'], 400);
        }

        try {
            return new WP_REST_Response($this->snippetService->getSnippets(), 200);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }
    }

    public function get_snippet(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->snippetService->isActive()) {
            return new WP_REST_Response(['error' => 'No supported snippet plugin is active'], 400);
        }

        $snippet = $this->snippetService->getSnippet((int) $request->get_param('id'));

        if ($snippet === null) {
            return new WP_REST_Response(['error' => 'Snippet not found'], 404);
        }

        return new WP_REST_Response($snippet, 200);
    }

    public function create_snippet(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->snippetService->isActive()) {
            return new WP_REST_Response(['error' => 'No supported snippet plugin is active'], 400);
        }

        try {
            $snippet = $this->snippetService->createSnippet([
                'name'                => $request->get_param('name'),
                'code'                => $request->get_param('code'),
                'type'                => $request->get_param('type'),
                'active'              => $request->get_param('active'),
                'description'         => $request->get_param('description'),
                'tags'                => $request->get_param('tags'),
                'location'            => $request->get_param('location'),
                'insertMethod'        => $request->get_param('insertMethod'),
                'priority'            => $request->get_param('priority'),
                'shortcodeAttributes' => $request->get_param('shortcodeAttributes'),
            ]);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        return new WP_REST_Response($snippet, 201);
    }

    public function update_snippet(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->snippetService->isActive()) {
            return new WP_REST_Response(['error' => 'No supported snippet plugin is active'], 400);
        }

        $data = array_filter([
            'name'                => $request->get_param('name'),
            'code'                => $request->get_param('code'),
            'type'                => $request->get_param('type'),
            'active'              => $request->get_param('active'),
            'description'         => $request->get_param('description'),
            'tags'                => $request->get_param('tags'),
            'location'            => $request->get_param('location'),
            'insertMethod'        => $request->get_param('insertMethod'),
            'priority'            => $request->get_param('priority'),
            'shortcodeAttributes' => $request->get_param('shortcodeAttributes'),
        ], fn($v) => $v !== null);

        try {
            $snippet = $this->snippetService->updateSnippet((int) $request->get_param('id'), $data);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        if ($snippet === null) {
            return new WP_REST_Response(['error' => 'Snippet not found'], 404);
        }

        return new WP_REST_Response($snippet, 200);
    }

    /** @return array<string, mixed> */
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
