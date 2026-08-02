<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Infrastructure;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Infrastructure\WpHttpClient;
use Loopress\Infrastructure\WpHttpClientException;
use Nyholm\Psr7\Request;
use PHPUnit\Framework\TestCase;

class WpHttpClientTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        Functions\when('is_wp_error')->alias(fn($thing) => $thing instanceof \WP_Error);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_sends_a_get_request_with_no_body_and_returns_the_response(): void
    {
        // Nyholm\Psr7\Request auto-adds a Host header from the URI when none is set explicitly.
        Functions\expect('wp_remote_request')
            ->once()
            ->with('https://example.test/x', ['method' => 'GET', 'headers' => ['Host' => 'example.test'], 'timeout' => 5])
            ->andReturn(['fake' => 'response']);
        Functions\when('wp_remote_retrieve_response_code')->justReturn(200);
        Functions\when('wp_remote_retrieve_body')->justReturn('ok');

        $client   = new WpHttpClient();
        $response = $client->sendRequest(new Request('GET', 'https://example.test/x'));

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('ok', (string) $response->getBody());
    }

    public function test_includes_the_body_when_the_request_has_one(): void
    {
        Functions\expect('wp_remote_request')
            ->once()
            ->with('https://example.test/x', ['method' => 'POST', 'headers' => ['Host' => 'example.test'], 'timeout' => 5, 'body' => 'hello']);
        Functions\when('wp_remote_retrieve_response_code')->justReturn(201);
        Functions\when('wp_remote_retrieve_body')->justReturn('');

        $client   = new WpHttpClient();
        $response = $client->sendRequest(new Request('POST', 'https://example.test/x', [], 'hello'));

        $this->assertSame(201, $response->getStatusCode());
    }

    public function test_omits_the_body_key_entirely_when_the_request_body_is_empty(): void
    {
        Functions\expect('wp_remote_request')
            ->once()
            ->with('https://example.test/x', ['method' => 'GET', 'headers' => ['Host' => 'example.test'], 'timeout' => 5]);
        Functions\when('wp_remote_retrieve_response_code')->justReturn(200);
        Functions\when('wp_remote_retrieve_body')->justReturn('');

        $client   = new WpHttpClient();
        $response = $client->sendRequest(new Request('GET', 'https://example.test/x', [], ''));

        $this->assertSame(200, $response->getStatusCode());
    }

    public function test_joins_multi_value_headers_with_a_comma(): void
    {
        Functions\expect('wp_remote_request')
            ->once()
            ->with('https://example.test/x', [
                'method'  => 'GET',
                'headers' => ['Host' => 'example.test', 'X-Foo' => 'a, b'],
                'timeout' => 5,
            ]);
        Functions\when('wp_remote_retrieve_response_code')->justReturn(200);
        Functions\when('wp_remote_retrieve_body')->justReturn('');

        $request  = (new Request('GET', 'https://example.test/x'))->withHeader('X-Foo', ['a', 'b']);
        $response = (new WpHttpClient())->sendRequest($request);

        $this->assertSame(200, $response->getStatusCode());
    }

    public function test_uses_the_timeout_passed_to_the_constructor(): void
    {
        Functions\expect('wp_remote_request')
            ->once()
            ->with('https://example.test/x', ['method' => 'GET', 'headers' => ['Host' => 'example.test'], 'timeout' => 30]);
        Functions\when('wp_remote_retrieve_response_code')->justReturn(200);
        Functions\when('wp_remote_retrieve_body')->justReturn('');

        $response = (new WpHttpClient(30))->sendRequest(new Request('GET', 'https://example.test/x'));

        $this->assertSame(200, $response->getStatusCode());
    }

    public function test_throws_a_network_exception_carrying_the_original_request_when_wp_remote_request_errors(): void
    {
        $error = new \WP_Error('http_request_failed', 'Could not resolve host');
        Functions\when('wp_remote_request')->justReturn($error);

        $request = new Request('GET', 'https://example.test/x');
        $client  = new WpHttpClient();

        try {
            $client->sendRequest($request);
            $this->fail('Expected WpHttpClientException to be thrown.');
        } catch (WpHttpClientException $exception) {
            $this->assertSame('Could not resolve host', $exception->getMessage());
            $this->assertSame($request, $exception->getRequest());
        }
    }
}
