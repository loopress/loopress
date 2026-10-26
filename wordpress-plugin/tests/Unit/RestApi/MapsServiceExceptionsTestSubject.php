<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\RestApi;

use Loopress\RestApi\MapsServiceExceptions;
use WP_REST_Response;

/**
 * Exposes the MapsServiceExceptions trait to MapsServiceExceptionsTest. A named class, not an
 * anonymous one, so PHPStan knows run() exists.
 */
final class MapsServiceExceptionsTestSubject
{
    use MapsServiceExceptions;

    /**
     * @param callable(): WP_REST_Response $handler
     * @param array<class-string<\Throwable>, int> $statuses
     */
    public function run(callable $handler, array $statuses = []): WP_REST_Response
    {
        return $this->mapServiceExceptions($handler, $statuses);
    }
}
