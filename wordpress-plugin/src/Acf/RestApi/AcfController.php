<?php

declare(strict_types=1);

namespace Loopress\Acf\RestApi;

use Loopress\Acf\Service\AcfService;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;
use WP_REST_Response;

class AcfController
{
    use RequiresManageOptionsCapability;

    /** URL-friendly slug (used in the route) => ACF's own internal post type constant. */
    private const TYPE_SLUGS = [
        'field-groups'  => 'acf-field-group',
        'options-pages' => 'acf-ui-options-page',
        'post-types'    => 'acf-post-type',
        'taxonomies'    => 'acf-taxonomy',
    ];

    public function __construct(private AcfService $acfService) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/acf/(?P<type>field-groups|post-types|taxonomies|options-pages)', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'list_objects'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => $this->typeArg(),
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'upsert_object'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => $this->typeArg(),
            ],
        ]);

        register_rest_route('loopress/v1', '/acf/(?P<type>field-groups|post-types|taxonomies|options-pages)/(?P<key>[A-Za-z0-9_-]+)', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_object'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => array_merge($this->typeArg(), $this->keyArg()),
            ],
            [
                'methods'             => 'DELETE',
                'callback'            => [$this, 'delete_object'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => array_merge($this->typeArg(), $this->keyArg()),
            ],
        ]);
    }

    public function list_objects(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->acfService->isActive()) {
            return new WP_REST_Response(['error' => 'ACF is not active'], 400);
        }

        try {
            return new WP_REST_Response($this->acfService->list($this->postType($request)), 200);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }
    }

    public function get_object(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->acfService->isActive()) {
            return new WP_REST_Response(['error' => 'ACF is not active'], 400);
        }

        try {
            $object = $this->acfService->get($this->postType($request), (string) $request->get_param('key'));
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        if ($object === null) {
            return new WP_REST_Response(['error' => 'ACF object not found'], 404);
        }

        return new WP_REST_Response($object, 200);
    }

    public function upsert_object(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->acfService->isActive()) {
            return new WP_REST_Response(['error' => 'ACF is not active'], 400);
        }

        $data = $request->get_json_params();
        if ($data === []) {
            return new WP_REST_Response(['error' => 'Request body must be a non-empty JSON object.'], 400);
        }

        try {
            $object = $this->acfService->upsert($this->postType($request), $data);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        return new WP_REST_Response($object, 200);
    }

    public function delete_object(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->acfService->isActive()) {
            return new WP_REST_Response(['error' => 'ACF is not active'], 400);
        }

        try {
            $deleted = $this->acfService->delete($this->postType($request), (string) $request->get_param('key'));
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        if (!$deleted) {
            return new WP_REST_Response(['error' => 'ACF object not found'], 404);
        }

        return new WP_REST_Response(null, 204);
    }

    private function postType(WP_REST_Request $request): string
    {
        return self::TYPE_SLUGS[(string) $request->get_param('type')];
    }

    /** @return array<string, mixed> */
    private function typeArg(): array
    {
        return [
            'type' => [
                'required' => true,
                'type'     => 'string',
                'enum'     => array_keys(self::TYPE_SLUGS),
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function keyArg(): array
    {
        return [
            'key' => [
                'required'          => true,
                'type'              => 'string',
                'validate_callback' => fn($v) => is_string($v) && $v !== '',
            ],
        ];
    }
}
