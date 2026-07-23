<?php

declare(strict_types=1);

namespace Loopress\Snippets\RestApi;

use Loopress\RestApi\RequiresManageOptionsCapability;
use Loopress\Snippets\Contract\SnippetData;
use Loopress\Snippets\Exception\NoActiveSnippetPluginException;
use Loopress\Snippets\Exception\SnippetProviderRequestException;
use Loopress\Snippets\Exception\UnsupportedLocationException;
use Loopress\Snippets\Service\SnippetService;
use WP_REST_Request;
use WP_REST_Response;

class SnippetController
{
    use RequiresManageOptionsCapability;

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
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'create_snippet'],
                'permission_callback' => $this->permissionCallback(),
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
                'permission_callback' => $this->permissionCallback(),
                'args'                => $this->idArg(),
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'update_snippet'],
                'permission_callback' => $this->permissionCallback(),
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
            [
                'methods'             => 'DELETE',
                'callback'            => [$this, 'delete_snippet'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => $this->idArg(),
            ],
        ]);
    }

    public function get_snippets(): WP_REST_Response
    {
        if (!$this->snippetService->isActive()) {
            return new WP_REST_Response(['error' => 'No supported snippet plugin is active'], 409);
        }

        try {
            $snippets = array_map(static fn(SnippetData $s): array => $s->toArray(), $this->snippetService->getSnippets());

            return new WP_REST_Response($snippets, 200);
        } catch (NoActiveSnippetPluginException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 409);
        } catch (SnippetProviderRequestException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 502);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }
    }

    public function get_snippet(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->snippetService->isActive()) {
            return new WP_REST_Response(['error' => 'No supported snippet plugin is active'], 409);
        }

        try {
            $snippet = $this->snippetService->getSnippet((int) $request->get_param('id'));
        } catch (NoActiveSnippetPluginException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 409);
        } catch (SnippetProviderRequestException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 502);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        if ($snippet === null) {
            return new WP_REST_Response(['error' => 'Snippet not found'], 404);
        }

        return new WP_REST_Response($snippet->toArray(), 200);
    }

    public function create_snippet(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->snippetService->isActive()) {
            return new WP_REST_Response(['error' => 'No supported snippet plugin is active'], 409);
        }

        try {
            $snippet = $this->snippetService->createSnippet(SnippetData::fromArray([
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
            ]));
        } catch (UnsupportedLocationException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 400);
        } catch (NoActiveSnippetPluginException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 409);
        } catch (SnippetProviderRequestException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 502);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        return new WP_REST_Response($snippet->toArray(), 201);
    }

    public function update_snippet(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->snippetService->isActive()) {
            return new WP_REST_Response(['error' => 'No supported snippet plugin is active'], 409);
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
            $snippet = $this->snippetService->updateSnippet((int) $request->get_param('id'), SnippetData::fromArray($data));
        } catch (UnsupportedLocationException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 400);
        } catch (NoActiveSnippetPluginException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 409);
        } catch (SnippetProviderRequestException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 502);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        if ($snippet === null) {
            return new WP_REST_Response(['error' => 'Snippet not found'], 404);
        }

        return new WP_REST_Response($snippet->toArray(), 200);
    }

    public function delete_snippet(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->snippetService->isActive()) {
            return new WP_REST_Response(['error' => 'No supported snippet plugin is active'], 409);
        }

        try {
            $deleted = $this->snippetService->deleteSnippet((int) $request->get_param('id'));
        } catch (NoActiveSnippetPluginException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 409);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        if (!$deleted) {
            return new WP_REST_Response(['error' => 'Snippet not found'], 404);
        }

        return new WP_REST_Response(null, 204);
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
