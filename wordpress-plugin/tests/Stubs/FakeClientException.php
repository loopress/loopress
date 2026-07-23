<?php

declare(strict_types=1);

namespace Loopress\Tests\Stubs;

use Psr\Http\Client\ClientExceptionInterface;

class FakeClientException extends \RuntimeException implements ClientExceptionInterface {}
