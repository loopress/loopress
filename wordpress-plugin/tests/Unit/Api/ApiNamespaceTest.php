<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Api\ApiNamespace;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class ApiNamespaceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_current_returns_the_default_when_never_configured(): void
    {
        Functions\when('get_option')->justReturn(ApiNamespace::DEFAULT);

        $this->assertSame(ApiNamespace::DEFAULT, ApiNamespace::current());
    }

    public function test_current_returns_a_configured_value(): void
    {
        Functions\when('get_option')->justReturn('my-headless-api/v1');

        $this->assertSame('my-headless-api/v1', ApiNamespace::current());
    }

    // Only reachable via a direct DB edit, since update_namespace() validates before saving:
    // must never let a malformed stored value break every route at boot.
    public function test_current_falls_back_to_default_when_the_stored_value_is_malformed(): void
    {
        Functions\when('get_option')->justReturn('has spaces');

        $this->assertSame(ApiNamespace::DEFAULT, ApiNamespace::current());
    }

    #[DataProvider('validNamespaces')]
    public function test_is_valid_accepts_a_well_formed_namespace(string $value): void
    {
        $this->assertTrue(ApiNamespace::isValid($value));
    }

    /** @return array<string, array{string}> */
    public static function validNamespaces(): array
    {
        return [
            'single-digit version' => ['my-headless-api/v1'],
            'multi-digit version'  => ['my-headless-api/v12'],
        ];
    }

    #[DataProvider('invalidNamespaces')]
    public function test_is_valid_rejects_the_reserved_namespace_and_malformed_input(mixed $value): void
    {
        $this->assertFalse(ApiNamespace::isValid($value));
    }

    /** @return array<string, array{mixed}> */
    public static function invalidNamespaces(): array
    {
        return [
            'reserved management namespace' => ['loopress/v1'],
            'empty'                          => [''],
            'spaces'                         => ['has spaces/v1'],
            'no version'                     => ['no-version'],
            'not a string'                   => [123],
        ];
    }
}
