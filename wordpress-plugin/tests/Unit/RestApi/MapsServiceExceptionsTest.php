<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\RestApi;

use Loopress\RestApi\MapsServiceExceptions;
use PHPUnit\Framework\TestCase;
use WP_REST_Response;

class MapsServiceExceptionsTest extends TestCase
{
    public function test_returns_the_handler_response_untouched_when_nothing_is_thrown(): void
    {
        $expected = new WP_REST_Response(['ok' => true], 201);

        $response = $this->subject()->run(fn(): WP_REST_Response => $expected);

        $this->assertSame($expected, $response);
    }

    public function test_maps_a_listed_exception_to_its_status_and_an_error_envelope(): void
    {
        $response = $this->subject()->run(
            function (): WP_REST_Response {
                throw new \DomainException('nope');
            },
            [\DomainException::class => 409],
        );

        $this->assertSame(409, $response->status);
        $this->assertSame(['error' => 'nope'], $response->data);
    }

    public function test_matches_the_first_listed_class_the_exception_is_an_instance_of(): void
    {
        // A subclass listed before its parent must win: the parent would also match, so this
        // pins that the map is scanned in order and stops at the first hit.
        $statuses = [MapsServiceExceptionsTestException::class => 400, \RuntimeException::class => 502];

        $response = $this->subject()->run(
            function (): WP_REST_Response {
                throw new MapsServiceExceptionsTestException('specific');
            },
            $statuses,
        );

        $this->assertSame(400, $response->status);
    }

    public function test_a_later_broader_class_still_matches_a_subclass_exception(): void
    {
        $response = $this->subject()->run(
            function (): WP_REST_Response {
                throw new MapsServiceExceptionsTestException('broad');
            },
            [\LogicException::class => 418, \RuntimeException::class => 502],
        );

        $this->assertSame(502, $response->status);
        $this->assertSame(['error' => 'broad'], $response->data);
    }

    public function test_an_unlisted_runtime_exception_falls_through_to_500(): void
    {
        $response = $this->subject()->run(
            function (): WP_REST_Response {
                throw new \RuntimeException('boom');
            },
            [\DomainException::class => 409],
        );

        $this->assertSame(500, $response->status);
        $this->assertSame(['error' => 'boom'], $response->data);
    }

    public function test_a_runtime_exception_falls_through_to_500_even_with_no_status_map(): void
    {
        $response = $this->subject()->run(function (): WP_REST_Response {
            throw new \RuntimeException('bare');
        });

        $this->assertSame(500, $response->status);
        $this->assertSame(['error' => 'bare'], $response->data);
    }

    public function test_a_non_runtime_throwable_is_rethrown_untouched(): void
    {
        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('not a runtime problem');

        $this->subject()->run(function (): WP_REST_Response {
            throw new \LogicException('not a runtime problem');
        });
    }

    public function test_an_error_is_rethrown_rather_than_wrapped_as_500(): void
    {
        $this->expectException(\TypeError::class);

        $this->subject()->run(function (): WP_REST_Response {
            throw new \TypeError('type');
        });
    }

    // A listed class is honoured even when it is not a RuntimeException, so the mapping is not
    // silently gated on the 500 fallback's type check.
    public function test_maps_a_listed_non_runtime_exception(): void
    {
        $response = $this->subject()->run(
            function (): WP_REST_Response {
                throw new \LogicException('mapped');
            },
            [\LogicException::class => 422],
        );

        $this->assertSame(422, $response->status);
        $this->assertSame(['error' => 'mapped'], $response->data);
    }

    private function subject(): object
    {
        return new class() {
            use MapsServiceExceptions;

            /** @param array<class-string<\Throwable>, int> $statuses */
            public function run(callable $handler, array $statuses = []): WP_REST_Response
            {
                return $this->mapServiceExceptions($handler, $statuses);
            }
        };
    }
}
