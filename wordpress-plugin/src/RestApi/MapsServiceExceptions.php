<?php

declare(strict_types=1);

namespace Loopress\RestApi;

use WP_REST_Response;

// Every resource controller (SEO, forms, snippets...) turns the same handful of service-layer
// exceptions into the same `['error' => <message>]` responses: a domain exception maps to a 4xx
// or 5xx the caller picks, and any other \RuntimeException is a 500. This centralises that so
// the envelope shape and the catch-all live in one place instead of being retyped in every
// handler. Kept in Loopress\RestApi (not a Full-only src/ dir, see scripts/build-flavor.cjs) so
// both editions' controllers can use it, same as RequiresManageOptionsCapability.
trait MapsServiceExceptions
{
    /**
     * Runs $handler and converts known exceptions to error responses. $statuses maps an
     * exception class to its HTTP status and is checked in order, so list the most specific
     * classes first (they all extend \RuntimeException). Any \RuntimeException not listed falls
     * through to 500; anything else is rethrown.
     *
     * @param callable(): WP_REST_Response $handler
     * @param array<class-string<\Throwable>, int> $statuses
     */
    private function mapServiceExceptions(callable $handler, array $statuses = []): WP_REST_Response
    {
        try {
            return $handler();
        } catch (\Throwable $e) {
            foreach ($statuses as $class => $status) {
                if ($e instanceof $class) {
                    return new WP_REST_Response(['error' => $e->getMessage()], $status);
                }
            }

            if ($e instanceof \RuntimeException) {
                return new WP_REST_Response(['error' => $e->getMessage()], 500);
            }

            throw $e;
        }
    }
}
