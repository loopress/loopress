<?php

declare(strict_types=1);

namespace Loopress\Acf\RestApi;

use Loopress\Acf\Exception\StaleAcfRevisionException;
use Loopress\Acf\Service\AcfService;
use Loopress\Infrastructure\Narrow;
use Loopress\RestApi\MapsServiceExceptions;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;
use WP_REST_Response;

final class AcfController
{
    use MapsServiceExceptions;
    use RequiresManageOptionsCapability;

    /** URL-friendly slug (used in the route) => ACF's own internal post type constant. */
    private const TYPE_SLUGS = [
        'field-groups'  => 'acf-field-group',
        'options-pages' => 'acf-ui-options-page',
        'post-types'    => 'acf-post-type',
        'taxonomies'    => 'acf-taxonomy',
    ];

    /** @var array<class-string<\Throwable>, int> */
    private const STATUSES = [
        StaleAcfRevisionException::class => 412,
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

        // Read-only despite the POST: the objects travel in the body, a GET has none.
        register_rest_route('loopress/v1', '/acf/normalize/(?P<type>field-groups|post-types|taxonomies|options-pages)', [
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'normalize_objects'],
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

        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response($this->acfService->list($this->postType($request)), 200)
        );
    }

    public function get_object(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->acfService->isActive()) {
            return new WP_REST_Response(['error' => 'ACF is not active'], 400);
        }

        return $this->mapServiceExceptions(function () use ($request): WP_REST_Response {
            $object = $this->acfService->get($this->postType($request), Narrow::string($request->get_param('key')));

            if ($object === null) {
                return new WP_REST_Response(['error' => 'ACF object not found'], 404);
            }

            return new WP_REST_Response($object, 200);
        });
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

        // `expectedRevision` isn't part of ACF's own object schema, it's protocol metadata for
        // the conditional-write precondition (#234), sent as a sibling field in the same body as
        // the ACF object itself. It's pulled out here and never forwarded to AcfService::upsert()'s
        // $data payload, so it can't leak into what acf_import_internal_post_type() persists.
        // Unlike a field the ACF payload actually owns, a malformed expectedRevision must never
        // be silently treated as absent: that would drop the precondition entirely instead of
        // surfacing the malformed input, letting a stray non-string value bypass #234's
        // protection outright.
        $expectedRevision = $data['expectedRevision'] ?? null;
        unset($data['expectedRevision']);
        // A JSON object's members: a numeric key (decoded as an int) is never one of them.
        $data = array_filter($data, 'is_string', ARRAY_FILTER_USE_KEY);
        if ($expectedRevision !== null && !is_string($expectedRevision)) {
            return new WP_REST_Response(['error' => 'If present, "expectedRevision" must be a string.'], 400);
        }

        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response(
                $this->acfService->upsert($this->postType($request), $data, $expectedRevision),
                200,
            ),
            self::STATUSES,
        );
    }

    public function normalize_objects(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->acfService->isActive()) {
            return new WP_REST_Response(['error' => 'ACF is not active'], 400);
        }

        $objects = $request->get_json_params()['objects'] ?? null;
        // Not array_is_list(): Plugin Check reads it as WP 6.5+, Light supports 6.2.
        if (!is_array($objects) || array_values($objects) !== $objects || array_filter($objects, 'is_array') !== $objects) {
            return new WP_REST_Response(['error' => 'Request body must be {"objects": [...]}, a list of ACF objects.'], 400);
        }

        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response($this->acfService->normalize($this->postType($request), array_map(Narrow::map(...), $objects)), 200),
        );
    }

    public function delete_object(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->acfService->isActive()) {
            return new WP_REST_Response(['error' => 'ACF is not active'], 400);
        }

        return $this->mapServiceExceptions(function () use ($request): WP_REST_Response {
            $deleted = $this->acfService->delete($this->postType($request), Narrow::string($request->get_param('key')));

            if (!$deleted) {
                return new WP_REST_Response(['error' => 'ACF object not found'], 404);
            }

            return new WP_REST_Response(null, 204);
        });
    }

    private function postType(WP_REST_Request $request): string
    {
        return self::TYPE_SLUGS[Narrow::string($request->get_param('type'))];
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
                'validate_callback' => fn(mixed $v): bool => is_string($v) && $v !== '',
            ],
        ];
    }
}
