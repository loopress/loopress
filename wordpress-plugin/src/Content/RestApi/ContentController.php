<?php

declare(strict_types=1);

namespace Loopress\Content\RestApi;

use Loopress\Content\Exception\InvalidContentRowException;
use Loopress\Content\Exception\NotLocalEnvironmentException;
use Loopress\Content\Service\ContentService;
use Loopress\RestApi\MapsServiceExceptions;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;
use WP_REST_Response;

// GET reads this site's content page by page (any site), POST replaces this site's content
// (a "local" site only, enforced by ContentService).
class ContentController
{
    use MapsServiceExceptions;
    use RequiresManageOptionsCapability;

    private const STATUSES = [
        NotLocalEnvironmentException::class => 403,
        InvalidContentRowException::class   => 400,
    ];

    private const MAX_LIMIT = 500;

    private const NAMESPACE = 'loopress/v1';

    public function __construct(private ContentService $service) {}

    public function register_routes(): void
    {
        register_rest_route(self::NAMESPACE, '/content', [
            'methods'             => 'GET',
            'callback'            => fn(): WP_REST_Response => new WP_REST_Response($this->service->info(), 200),
            'permission_callback' => $this->permissionCallback(),
        ]);

        register_rest_route(self::NAMESPACE, '/content/reset', [
            'methods'             => 'POST',
            'callback'            => [$this, 'reset'],
            'permission_callback' => $this->permissionCallback(),
        ]);

        register_rest_route(self::NAMESPACE, '/content/posts', [
            [
                'methods'             => 'GET',
                'callback'            => fn(WP_REST_Request $request): WP_REST_Response => $this->page($request, $this->service->exportPosts(...)),
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'POST',
                'callback'            => fn(WP_REST_Request $request): WP_REST_Response => $this->import(
                    fn(array $body): array => $this->service->importPosts($this->list($body, 'posts'), $this->list($body, 'postmeta'), $this->list($body, 'termRelationships')),
                    $request,
                ),
                'permission_callback' => $this->permissionCallback(),
            ],
        ]);

        register_rest_route(self::NAMESPACE, '/content/terms', [
            [
                'methods'             => 'GET',
                'callback'            => fn(WP_REST_Request $request): WP_REST_Response => $this->page($request, $this->service->exportTerms(...)),
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'POST',
                'callback'            => fn(WP_REST_Request $request): WP_REST_Response => $this->import(
                    fn(array $body): array => $this->service->importTerms($this->list($body, 'terms'), $this->list($body, 'termTaxonomy'), $this->list($body, 'termmeta')),
                    $request,
                ),
                'permission_callback' => $this->permissionCallback(),
            ],
        ]);
    }

    public function reset(WP_REST_Request $request): WP_REST_Response
    {
        $body    = $request->get_json_params();
        $home    = null;
        $uploads = null;
        if (is_array($body)) {
            $home    = $body['home'] ?? null;
            $uploads = $body['uploadsUrl'] ?? null;
        }

        if (!is_string($home) || !is_string($uploads) || $home === '') {
            return new WP_REST_Response(['error' => 'Request body must include the source site\'s "home" and "uploadsUrl".'], 400);
        }

        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response($this->service->reset($home, $uploads), 200),
            self::STATUSES,
        );
    }

    /** @param callable(int, int): array<string, mixed> $export */
    private function page(WP_REST_Request $request, callable $export): WP_REST_Response
    {
        $after = max(0, (int) $request->get_param('after'));
        $limit = min(self::MAX_LIMIT, max(1, (int) ($request->get_param('limit') ?? 100)));

        return $this->mapServiceExceptions(fn(): WP_REST_Response => new WP_REST_Response($export($after, $limit), 200));
    }

    /** @param callable(array<array-key, mixed>): array<string, int> $import */
    private function import(callable $import, WP_REST_Request $request): WP_REST_Response
    {
        $body = $request->get_json_params();
        if (!is_array($body)) {
            return new WP_REST_Response(['error' => 'Request body must be a JSON object.'], 400);
        }

        return $this->mapServiceExceptions(fn(): WP_REST_Response => new WP_REST_Response($import($body), 200), self::STATUSES);
    }

    /**
     * @param array<array-key, mixed> $body
     * @return list<mixed>
     */
    private function list(array $body, string $key): array
    {
        $value = $body[$key] ?? [];
        // Not array_is_list(): WordPress polyfills it only from 6.5, the plugin supports 6.2.
        $list = is_array($value) ? array_values($value) : null;
        if ($list === null || $list !== $value) {
            // phpcs:disable WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML: esc_html() would print &quot; (see phpcs.xml.dist).
            throw new InvalidContentRowException("\"{$key}\" must be an array.");
            // phpcs:enable WordPress.Security.EscapeOutput.ExceptionNotEscaped
        }

        return $list;
    }
}
