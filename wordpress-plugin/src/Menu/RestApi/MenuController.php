<?php

declare(strict_types=1);

namespace Loopress\Menu\RestApi;

use Loopress\Menu\Service\MenuService;
use Loopress\RestApi\MapsServiceExceptions;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;
use WP_REST_Response;

class MenuController
{
    use MapsServiceExceptions;
    use RequiresManageOptionsCapability;

    public function __construct(private MenuService $menuService) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/menus', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'list_menus'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'upsert_menu'],
                'permission_callback' => $this->permissionCallback(),
            ],
        ]);

        register_rest_route('loopress/v1', '/menus/(?P<slug>[^/]+)', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_menu'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'DELETE',
                'callback'            => [$this, 'delete_menu'],
                'permission_callback' => $this->permissionCallback(),
            ],
        ]);

        // A separate top-level route, not `/menus/locations`: the latter would be ambiguous
        // with the `{slug}` route above (a menu could genuinely be named "locations").
        register_rest_route('loopress/v1', '/menu-locations', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_locations'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'update_locations'],
                'permission_callback' => $this->permissionCallback(),
            ],
        ]);
    }

    // ── menus ───────────────────────────────────────────────────────────────

    public function list_menus(): WP_REST_Response
    {
        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response($this->menuService->listMenus(), 200),
        );
    }

    public function get_menu(WP_REST_Request $request): WP_REST_Response
    {
        return $this->mapServiceExceptions(function () use ($request): WP_REST_Response {
            $menu = $this->menuService->getMenu((string) $request->get_param('slug'));

            return $menu === null
                ? new WP_REST_Response(['error' => 'Menu not found'], 404)
                : new WP_REST_Response($menu, 200);
        });
    }

    // POST alone covers create-or-update (the service resolves that server-side via the menu's
    // own `slug`), the same shape as ACF's push endpoint: no separate id, no rename-on-push.
    public function upsert_menu(WP_REST_Request $request): WP_REST_Response
    {
        $body = $request->get_json_params();
        if (!is_array($body)) {
            return new WP_REST_Response(['error' => 'Request body must include a non-empty "slug" and "name".'], 400);
        }

        $slug  = (string) ($body['slug'] ?? '');
        $name  = (string) ($body['name'] ?? '');
        $items = $body['items'] ?? [];

        if ($slug === '' || $name === '') {
            return new WP_REST_Response(['error' => 'Request body must include a non-empty "slug" and "name".'], 400);
        }

        if (!is_array($items)) {
            return new WP_REST_Response(['error' => 'Request body\'s "items" must be an array.'], 400);
        }

        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response($this->menuService->upsertMenu($slug, $name, $items), 200),
        );
    }

    public function delete_menu(WP_REST_Request $request): WP_REST_Response
    {
        $slug = (string) $request->get_param('slug');

        return $this->mapServiceExceptions(function () use ($slug): WP_REST_Response {
            $deleted = $this->menuService->deleteMenu($slug);

            return $deleted
                ? new WP_REST_Response(['deleted' => true, 'slug' => $slug], 200)
                : new WP_REST_Response(['error' => 'Menu not found'], 404);
        });
    }

    // ── locations ───────────────────────────────────────────────────────────

    public function get_locations(): WP_REST_Response
    {
        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response($this->asJsonObject($this->menuService->getLocations()), 200),
        );
    }

    public function update_locations(WP_REST_Request $request): WP_REST_Response
    {
        $body = $request->get_json_params();
        if (!is_array($body)) {
            return new WP_REST_Response(['error' => 'Request body must be a JSON object of location => menu slug (or null).'], 400);
        }

        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response($this->asJsonObject($this->menuService->setLocations($body)), 200),
        );
    }

    // A theme can register zero nav menu locations (or every location can end up unassigned in
    // $mapping), in which case the map below is a genuinely empty PHP array. json_encode()
    // can't tell that apart from an empty list, and would send `[]` instead of `{}`, which the
    // CLI's `location => slug` reader then rejects as "not a JSON object". Casting to an object
    // forces object encoding regardless of emptiness, the same ambiguity every PHP-to-JSON
    // association map has to guard against explicitly. Typed `object`, not `\stdClass`: that's
    // as precisely as a plain `(object)` array-cast is statically knowable, even though the
    // resulting instance always is one at runtime.
    /** @param array<string, null|string> $locations */
    private function asJsonObject(array $locations): object
    {
        return (object) $locations;
    }
}
