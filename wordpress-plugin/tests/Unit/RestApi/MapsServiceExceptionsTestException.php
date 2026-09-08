<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\RestApi;

/**
 * A concrete \RuntimeException subclass used by MapsServiceExceptionsTest to check that the
 * trait scans its status map in order and stops at the first class the exception matches.
 */
class MapsServiceExceptionsTestException extends \RuntimeException
{
}
