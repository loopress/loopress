<?php

declare(strict_types=1);

namespace Loopress\Tests\Stubs;

use Psr\Http\Client\ClientExceptionInterface;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/**
 * Minimal PSR-18 test double: configure a fixed response or exception, then read
 * $lastRequest back to assert what was actually sent.
 */
class FakeHttpClient implements ClientInterface
{
    private ?ResponseInterface $response = null;
    private ?ClientExceptionInterface $exception = null;
    public ?RequestInterface $lastRequest = null;

    public function willReturn(ResponseInterface $response): void
    {
        $this->response  = $response;
        $this->exception = null;
    }

    public function willThrow(ClientExceptionInterface $exception): void
    {
        $this->exception = $exception;
        $this->response  = null;
    }

    public function sendRequest(RequestInterface $request): ResponseInterface
    {
        $this->lastRequest = $request;

        if ($this->exception !== null) {
            throw $this->exception;
        }

        return $this->response ?? throw new \LogicException(
            'FakeHttpClient::willReturn()/willThrow() must be called before sendRequest().',
        );
    }
}
