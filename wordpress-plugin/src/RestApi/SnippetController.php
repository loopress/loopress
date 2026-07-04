<?php

namespace Loopress\RestApi;

use Loopress\Service\SnippetService;
use WP_REST_Request;
use WP_REST_Response;

class SnippetController
{
    /**
     * WPCode's own `wpcode_location` taxonomy term slugs, limited to the free-tier locations
     * supported by this integration (see WPCode_Auto_Insert_Everywhere/Site_Wide upstream).
     *
     * @var string[]
     */
    private const LOCATIONS = [
        'everywhere',
        'frontend_only',
        'admin_only',
        'on_demand',
        'site_wide_header',
        'site_wide_body',
        'site_wide_footer',
    ];

    public function __construct(private SnippetService $snippetService) {}

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
                'args'                => [
                    'title'                => ['required' => true,  'type' => 'string'],
                    'code'                 => ['required' => true,  'type' => 'string'],
                    'type'                 => ['required' => false, 'type' => 'string', 'default' => 'php', 'enum' => ['php', 'js', 'css', 'html', 'text']],
                    'active'               => ['required' => false, 'type' => 'boolean', 'default' => false],
                    'note'                 => ['required' => false, 'type' => 'string',  'default' => ''],
                    'tags'                 => ['required' => false, 'type' => 'array',   'default' => [], 'items' => ['type' => 'string']],
                    'location'             => ['required' => false, 'type' => 'string', 'enum' => self::LOCATIONS],
                    'insert_method'        => ['required' => false, 'type' => 'string', 'default' => 'auto', 'enum' => ['auto', 'shortcode']],
                    'priority'             => ['required' => false, 'type' => 'integer', 'default' => 10],
                    'shortcode_attributes' => ['required' => false, 'type' => 'array', 'default' => [], 'items' => ['type' => 'string']],
                ],
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
                'args'                => array_merge($this->idArg(), [
                    'title'                => ['required' => false, 'type' => 'string'],
                    'code'                 => ['required' => false, 'type' => 'string'],
                    'type'                 => ['required' => false, 'type' => 'string', 'enum' => ['php', 'js', 'css', 'html', 'text']],
                    'active'               => ['required' => false, 'type' => 'boolean'],
                    'note'                 => ['required' => false, 'type' => 'string'],
                    'tags'                 => ['required' => false, 'type' => 'array', 'items' => ['type' => 'string']],
                    'location'             => ['required' => false, 'type' => 'string', 'enum' => self::LOCATIONS],
                    'insert_method'        => ['required' => false, 'type' => 'string', 'enum' => ['auto', 'shortcode']],
                    'priority'             => ['required' => false, 'type' => 'integer'],
                    'shortcode_attributes' => ['required' => false, 'type' => 'array', 'items' => ['type' => 'string']],
                ]),
            ],
        ]);
    }

    public function get_snippets(): WP_REST_Response
    {
        if (!$this->snippetService->isActive()) {
            return new WP_REST_Response(['error' => 'No supported snippet plugin is active'], 400);
        }

        return new WP_REST_Response($this->snippetService->getSnippets(), 200);
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
                'title'                => $request->get_param('title'),
                'code'                 => $request->get_param('code'),
                'type'                 => $request->get_param('type'),
                'active'               => $request->get_param('active'),
                'note'                 => $request->get_param('note'),
                'tags'                 => $request->get_param('tags'),
                'location'             => $request->get_param('location'),
                'insert_method'        => $request->get_param('insert_method'),
                'priority'             => $request->get_param('priority'),
                'shortcode_attributes' => $request->get_param('shortcode_attributes'),
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
            'title'                => $request->get_param('title'),
            'code'                 => $request->get_param('code'),
            'type'                 => $request->get_param('type'),
            'active'               => $request->get_param('active'),
            'note'                 => $request->get_param('note'),
            'tags'                 => $request->get_param('tags'),
            'location'             => $request->get_param('location'),
            'insert_method'        => $request->get_param('insert_method'),
            'priority'             => $request->get_param('priority'),
            'shortcode_attributes' => $request->get_param('shortcode_attributes'),
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
