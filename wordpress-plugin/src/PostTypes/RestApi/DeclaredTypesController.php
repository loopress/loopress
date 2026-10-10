<?php

declare(strict_types=1);

namespace Loopress\PostTypes\RestApi;

use Loopress\PostTypes\Exception\InvalidDeclarationException;
use Loopress\PostTypes\Exception\StaleDeclarationRevisionException;
use Loopress\PostTypes\Service\AbstractDeclaredTypeService;
use Loopress\RestApi\MapsServiceExceptions;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;
use WP_REST_Response;

// The same five routes for each declared type, under its own base: `post-types` and
// `taxonomies`, plus `registered-post-types` / `registered-taxonomies`.
class DeclaredTypesController
{
    use MapsServiceExceptions;
    use RequiresManageOptionsCapability;

    private const STATUSES = [
        InvalidDeclarationException::class       => 422,
        StaleDeclarationRevisionException::class => 412,
    ];

    /**
     * @param string $route Plural REST base, e.g. "post-types".
     * @param string $noun  Subject of the 404 message, e.g. "Post type".
     */
    public function __construct(
        private AbstractDeclaredTypeService $service,
        private string $route,
        private string $noun,
    ) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', "/{$this->route}", [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'list_items'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'upsert_item'],
                'permission_callback' => $this->permissionCallback(),
            ],
        ]);

        register_rest_route('loopress/v1', "/{$this->route}/(?P<slug>[^/]+)", [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_item'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'DELETE',
                'callback'            => [$this, 'delete_item'],
                'permission_callback' => $this->permissionCallback(),
            ],
        ]);

        // Top-level, not `/<route>/registered`: "registered" is a valid slug.
        register_rest_route('loopress/v1', "/registered-{$this->route}", [
            'methods'             => 'GET',
            'callback'            => [$this, 'list_registered'],
            'permission_callback' => $this->permissionCallback(),
        ]);
    }

    public function list_items(): WP_REST_Response
    {
        return $this->mapServiceExceptions(fn(): WP_REST_Response => new WP_REST_Response($this->service->list(), 200));
    }

    public function list_registered(): WP_REST_Response
    {
        return $this->mapServiceExceptions(fn(): WP_REST_Response => new WP_REST_Response($this->service->registered(), 200));
    }

    public function get_item(WP_REST_Request $request): WP_REST_Response
    {
        $item = $this->service->get((string) $request->get_param('slug'));

        return $item === null
            ? new WP_REST_Response(['error' => "{$this->noun} not found"], 404)
            : new WP_REST_Response($item, 200);
    }

    // POST alone covers create-or-update, keyed by the body's `slug`, same shape as menus.
    public function upsert_item(WP_REST_Request $request): WP_REST_Response
    {
        $body = $request->get_json_params();
        if (!is_array($body)) {
            return new WP_REST_Response(['error' => 'Request body must include a string "slug" and an "args" object.'], 400);
        }

        $slug = $body['slug'] ?? null;
        $args = $body['args'] ?? null;

        // A JSON array (`[1, 2]`) decodes to a PHP array too, but register_*() wants named keys.
        // Not array_is_list(): Plugin Check reads it as WP 6.5+, Light supports 6.2.
        if (!is_string($slug) || !is_array($args) || ($args !== [] && !is_string(array_key_first($args)))) {
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

    public function delete_item(WP_REST_Request $request): WP_REST_Response
    {
        $slug = (string) $request->get_param('slug');

        return $this->service->delete($slug)
            ? new WP_REST_Response(['deleted' => true, 'slug' => $slug], 200)
            : new WP_REST_Response(['error' => "{$this->noun} not found"], 404);
    }
}
