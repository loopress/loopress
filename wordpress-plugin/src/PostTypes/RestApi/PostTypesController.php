<?php

declare(strict_types=1);

namespace Loopress\PostTypes\RestApi;

use Loopress\PostTypes\Exception\InvalidPostTypeException;
use Loopress\PostTypes\Exception\StalePostTypeRevisionException;
use Loopress\PostTypes\Service\PostTypeService;
use Loopress\RestApi\MapsServiceExceptions;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;
use WP_REST_Response;

class PostTypesController
{
    use MapsServiceExceptions;
    use RequiresManageOptionsCapability;

    private const STATUSES = [
        InvalidPostTypeException::class       => 422,
        StalePostTypeRevisionException::class => 412,
    ];

    public function __construct(private PostTypeService $service) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/post-types', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'list_post_types'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'upsert_post_type'],
                'permission_callback' => $this->permissionCallback(),
            ],
        ]);

        register_rest_route('loopress/v1', '/post-types/(?P<slug>[^/]+)', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_post_type'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'DELETE',
                'callback'            => [$this, 'delete_post_type'],
                'permission_callback' => $this->permissionCallback(),
            ],
        ]);

        // Top-level, not `/post-types/registered`: "registered" is a valid post type slug.
        register_rest_route('loopress/v1', '/registered-post-types', [
            'methods'             => 'GET',
            'callback'            => [$this, 'list_registered'],
            'permission_callback' => $this->permissionCallback(),
        ]);
    }

    public function list_post_types(): WP_REST_Response
    {
        return $this->mapServiceExceptions(fn(): WP_REST_Response => new WP_REST_Response($this->service->list(), 200));
    }

    public function list_registered(): WP_REST_Response
    {
        return $this->mapServiceExceptions(fn(): WP_REST_Response => new WP_REST_Response($this->service->registered(), 200));
    }

    public function get_post_type(WP_REST_Request $request): WP_REST_Response
    {
        $postType = $this->service->get((string) $request->get_param('slug'));

        return $postType === null
            ? new WP_REST_Response(['error' => 'Post type not found'], 404)
            : new WP_REST_Response($postType, 200);
    }

    // POST alone covers create-or-update, keyed by the body's `slug`, same shape as menus.
    public function upsert_post_type(WP_REST_Request $request): WP_REST_Response
    {
        $body = $request->get_json_params();
        if (!is_array($body)) {
            return new WP_REST_Response(['error' => 'Request body must include a string "slug" and an "args" object.'], 400);
        }

        $slug = $body['slug'] ?? null;
        $args = $body['args'] ?? null;

        // A JSON array (`[]`) decodes to a PHP list too, but register_post_type() wants keys.
        if (!is_string($slug) || !is_array($args) || ($args !== [] && array_is_list($args))) {
            return new WP_REST_Response(['error' => 'Request body must include a string "slug" and an "args" object.'], 400);
        }

        // Same reasoning as MenuController: a malformed expectedRevision must never be read as absent.
        $expectedRevision = $body['expectedRevision'] ?? null;
        if ($expectedRevision !== null && !is_string($expectedRevision)) {
            return new WP_REST_Response(['error' => 'If present, "expectedRevision" must be a string.'], 400);
        }

        /** @var array<string, mixed> $args */
        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response($this->service->upsert($slug, $args, $expectedRevision), 200),
            self::STATUSES,
        );
    }

    public function delete_post_type(WP_REST_Request $request): WP_REST_Response
    {
        $slug = (string) $request->get_param('slug');

        return $this->service->delete($slug)
            ? new WP_REST_Response(['deleted' => true, 'slug' => $slug], 200)
            : new WP_REST_Response(['error' => 'Post type not found'], 404);
    }
}
