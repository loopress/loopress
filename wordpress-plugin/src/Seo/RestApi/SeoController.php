<?php

declare(strict_types=1);

namespace Loopress\Seo\RestApi;

use Loopress\RestApi\MapsServiceExceptions;
use Loopress\RestApi\RequiresManageOptionsCapability;
use Loopress\Seo\Exception\NoActiveSeoPluginException;
use Loopress\Seo\Exception\RedirectsUnavailableException;
use Loopress\Seo\Service\SeoService;
use WP_REST_Request;
use WP_REST_Response;

class SeoController
{
    use MapsServiceExceptions;
    use RequiresManageOptionsCapability;

    // Every handler maps the same service exceptions the same way (redirect handlers add
    // RedirectsUnavailableException => 400); \RuntimeException => 500 is applied by the trait.
    private const POST_META_STATUSES = [NoActiveSeoPluginException::class => 409];
    private const REDIRECT_STATUSES  = [
        RedirectsUnavailableException::class => 400,
        NoActiveSeoPluginException::class    => 409,
    ];

    public function __construct(private SeoService $seoService) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/seo/post-meta/(?P<type>[a-z0-9_-]+)', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'list_post_meta'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'upsert_post_meta'],
                'permission_callback' => $this->permissionCallback(),
            ],
        ]);

        register_rest_route('loopress/v1', '/seo/post-meta/(?P<type>[a-z0-9_-]+)/(?P<slug>[^/]+)', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_post_meta'],
            'permission_callback' => $this->permissionCallback(),
        ]);

        register_rest_route('loopress/v1', '/seo/settings', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_settings'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'update_settings'],
                'permission_callback' => $this->permissionCallback(),
            ],
        ]);

        register_rest_route('loopress/v1', '/seo/redirects', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'list_redirects'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'create_redirect'],
                'permission_callback' => $this->permissionCallback(),
            ],
        ]);

        register_rest_route('loopress/v1', '/seo/redirects/(?P<id>\d+)', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_redirect'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'update_redirect'],
                'permission_callback' => $this->permissionCallback(),
            ],
        ]);
    }

    // ── post-meta ───────────────────────────────────────────────────────────

    public function list_post_meta(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->seoService->isActive()) {
            return $this->inactiveResponse();
        }

        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response(
                $this->seoService->listPostMeta((string) $request->get_param('type')),
                200,
            ),
            self::POST_META_STATUSES,
        );
    }

    public function get_post_meta(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->seoService->isActive()) {
            return $this->inactiveResponse();
        }

        return $this->mapServiceExceptions(function () use ($request): WP_REST_Response {
            $post = $this->seoService->getPostMeta((string) $request->get_param('type'), (string) $request->get_param('slug'));

            return $post === null
                ? new WP_REST_Response(['error' => 'Post not found'], 404)
                : new WP_REST_Response($post, 200);
        }, self::POST_META_STATUSES);
    }

    public function upsert_post_meta(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->seoService->isActive()) {
            return $this->inactiveResponse();
        }

        $body = $request->get_json_params();
        $slug = (string) ($body['slug'] ?? '');
        $meta = $body['meta'] ?? null;

        if ($slug === '' || !is_array($meta)) {
            return new WP_REST_Response(['error' => 'Request body must include a non-empty "slug" and a "meta" object.'], 400);
        }

        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response(
                $this->seoService->upsertPostMeta((string) $request->get_param('type'), $slug, $meta),
                200,
            ),
            self::POST_META_STATUSES,
        );
    }

    // ── settings ────────────────────────────────────────────────────────────

    public function get_settings(): WP_REST_Response
    {
        if (!$this->seoService->isActive()) {
            return $this->inactiveResponse();
        }

        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response($this->seoService->getSettings(), 200),
            self::POST_META_STATUSES,
        );
    }

    public function update_settings(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->seoService->isActive()) {
            return $this->inactiveResponse();
        }

        $data = $request->get_json_params();
        if ($data === []) {
            return new WP_REST_Response(['error' => 'Request body must be a non-empty JSON object.'], 400);
        }

        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response($this->seoService->updateSettings($data), 200),
            self::POST_META_STATUSES,
        );
    }

    // ── redirects ───────────────────────────────────────────────────────────

    public function list_redirects(): WP_REST_Response
    {
        if (!$this->seoService->isActive()) {
            return $this->inactiveResponse();
        }

        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response($this->seoService->listRedirections(), 200),
            self::REDIRECT_STATUSES,
        );
    }

    public function get_redirect(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->seoService->isActive()) {
            return $this->inactiveResponse();
        }

        return $this->mapServiceExceptions(function () use ($request): WP_REST_Response {
            $redirect = $this->seoService->getRedirection((int) $request->get_param('id'));

            return $redirect === null
                ? new WP_REST_Response(['error' => 'Redirect not found'], 404)
                : new WP_REST_Response($redirect, 200);
        }, self::REDIRECT_STATUSES);
    }

    public function create_redirect(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->seoService->isActive()) {
            return $this->inactiveResponse();
        }

        $data = $request->get_json_params();
        if ($data === []) {
            return new WP_REST_Response(['error' => 'Request body must be a non-empty JSON object.'], 400);
        }

        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response($this->seoService->createRedirection($data), 201),
            self::REDIRECT_STATUSES,
        );
    }

    public function update_redirect(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->seoService->isActive()) {
            return $this->inactiveResponse();
        }

        $data = $request->get_json_params();

        return $this->mapServiceExceptions(function () use ($request, $data): WP_REST_Response {
            $redirect = $this->seoService->updateRedirection((int) $request->get_param('id'), $data);

            return $redirect === null
                ? new WP_REST_Response(['error' => 'Redirect not found'], 404)
                : new WP_REST_Response($redirect, 200);
        }, self::REDIRECT_STATUSES);
    }

    private function inactiveResponse(): WP_REST_Response
    {
        return new WP_REST_Response(['error' => 'No supported SEO plugin is active'], 400);
    }
}
