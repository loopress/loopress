<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Apps\Infrastructure;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Apps\Infrastructure\AppStore;
use PHPUnit\Framework\TestCase;

class AppStoreTest extends TestCase
{
    /** @var array<string, mixed> */
    private array $option = [];
    /** @var list<bool> autoload flag of each write */
    private array $autoload = [];

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        Functions\when('get_option')->alias(fn(string $name, mixed $fallback): mixed => count($this->option) > 0 ? $this->option : $fallback);
        Functions\when('update_option')->alias(function (string $name, array $value, bool $autoload): bool {
            /** @var array<string, mixed> $value */
            $this->option     = $value;
            $this->autoload[] = $autoload;

            return true;
        });
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_an_unknown_app_is_null_and_a_corrupt_option_reads_as_empty(): void
    {
        $store = new AppStore();

        $this->assertNull($store->get('search'));
        Functions\when('get_option')->justReturn('corrupt');
        $this->assertSame([], $store->all());
    }

    public function test_put_stores_a_record_that_get_returns_without_touching_the_others(): void
    {
        $store = new AppStore();
        $store->put('search', ['buildId' => 'a1']);
        $store->put('cart', ['buildId' => 'b2']);
        $store->put('search', ['buildId' => 'a3']);

        $this->assertSame(['buildId' => 'a3'], $store->get('search'));
        $this->assertSame(['buildId' => 'b2'], $store->get('cart'));
        $this->assertSame([false, false, false], $this->autoload);
    }

    public function test_a_record_that_is_not_an_array_is_ignored(): void
    {
        $this->option = ['search' => 'oops'];

        $this->assertNull((new AppStore())->get('search'));
    }

    public function test_forget_removes_only_that_app(): void
    {
        $store = new AppStore();
        $store->put('search', ['buildId' => 'a1']);
        $store->put('cart', ['buildId' => 'b2']);

        $store->forget('search');

        $this->assertSame(['cart' => ['buildId' => 'b2']], $store->all());
        $this->assertSame([false, false, false], $this->autoload);
    }
}
