<?php

declare(strict_types=1);

namespace Loopress\Module;

use Loopress\Contract\Module;

class RestCacheModule implements Module
{
    public function boot(): void
    {
        add_filter('rest_post_dispatch', [$this, 'addNoCacheHeaders'], 10, 3);
        add_action('litespeed_init', [$this, 'litespeedNoCache']);
    }

    public function addNoCacheHeaders(\WP_REST_Response $response, \WP_REST_Server $_server, \WP_REST_Request $request): \WP_REST_Response
    {
        if (str_starts_with($request->get_route(), '/loopress/v1')) {
            $response->header('X-LiteSpeed-Cache-Control', 'no-cache');
            $response->header('Cache-Control', 'no-store, no-cache, must-revalidate');
            $response->header('Pragma', 'no-cache');
        }

        return $response;
    }

    public function litespeedNoCache(): void
    {
        $uri = isset($_SERVER['REQUEST_URI']) ? sanitize_text_field(wp_unslash($_SERVER['REQUEST_URI'])) : '';
        if (str_contains($uri, '/wp-json/loopress/')) {
            do_action('litespeed_control_set_nocache', 'loopress REST API');
        }
    }
}
