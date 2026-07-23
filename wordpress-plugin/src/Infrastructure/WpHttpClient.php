<?php

declare(strict_types=1);

namespace Loopress\Infrastructure;

use Nyholm\Psr7\Response;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/**
 * PSR-18 HTTP client adapter over wp_remote_request(). Lets code that needs to make an HTTP
 * call (GithubReleaseChecker, PackagistClient) depend on Psr\Http\Client\ClientInterface
 * instead of WordPress's wp_remote_*()/is_wp_error() functions directly, so their tests can
 * inject a plain PSR-18 double instead of stubbing WordPress globals through Brain\Monkey.
 * Builds the response via nyholm/psr7 directly rather than an injected PSR-17 factory: this
 * plugin hard-depends on nyholm/psr7 (it's the only PSR-7 implementation ever in its own
 * vendor/), so a swappable factory here buys no actual swappability, only an extra
 * constructor parameter. Lives outside the Full-only feature directories: nothing here is
 * specific to Dependencies or Update, so a future Light feature needing HTTP could reuse it.
 */
class WpHttpClient implements ClientInterface
{
    public function __construct(private int $timeoutSeconds = 5)
    {
    }

    public function sendRequest(RequestInterface $request): ResponseInterface
    {
        $headers = [];
        foreach ($request->getHeaders() as $name => $values) {
            $headers[$name] = implode(', ', $values);
        }

        $args = [
            'method'  => $request->getMethod(),
            'headers' => $headers,
            'timeout' => $this->timeoutSeconds,
        ];

        $body = (string) $request->getBody();
        if ($body !== '') {
            $args['body'] = $body;
        }

        $response = wp_remote_request((string) $request->getUri(), $args);

        if (is_wp_error($response)) {
            throw new WpHttpClientException($response->get_error_message(), $request);
        }

        return new Response(
            (int) wp_remote_retrieve_response_code($response),
            [],
            (string) wp_remote_retrieve_body($response),
        );
    }
}
