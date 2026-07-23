<?php

declare(strict_types=1);

namespace Loopress\Infrastructure;

use Psr\Http\Client\NetworkExceptionInterface;
use Psr\Http\Message\RequestInterface;

class WpHttpClientException extends \RuntimeException implements NetworkExceptionInterface
{
    public function __construct(string $message, private readonly RequestInterface $request)
    {
        parent::__construct($message);
    }

    public function getRequest(): RequestInterface
    {
        return $this->request;
    }
}
