<?php

declare(strict_types=1);

namespace Loopress\Tests\Stubs;

use WP_REST_Request;

/**
 * Builds a request through WP_REST_Request's real API, so tests type-check against the
 * WordPress stub rather than the looser test double in WpRestStubs.php.
 */
final class RestRequest
{
    /** @param array<string, mixed> $params */
    public static function with(array $params, string $route = ''): WP_REST_Request
    {
        $request = new WP_REST_Request('', $route);
        foreach ($params as $key => $value) {
            $request->set_param($key, $value);
        }

        return $request;
    }
}
