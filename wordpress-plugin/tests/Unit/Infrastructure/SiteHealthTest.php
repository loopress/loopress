<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Infrastructure;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Infrastructure\SiteHealth;
use PHPUnit\Framework\TestCase;

class SiteHealthTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        Functions\when('esc_url')->returnArg();
        Functions\when('admin_url')->alias(static fn (string $path): string => 'https://example.test/wp-admin/' . $path);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_no_issues_is_a_good_result(): void
    {
        $result = SiteHealth::result('loopress_x', 'Loopress X', 'code', []);

        $this->assertSame('good', $result['status']);
        $this->assertSame('loopress_x', $result['test']);
    }

    public function test_issues_are_listed_with_a_link_to_the_loopress_tab(): void
    {
        $result = SiteHealth::result('loopress_x', 'Loopress X', 'dependencies', [
            ['code' => 'a', 'message' => 'First problem'],
            ['code' => 'b', 'message' => 'Second problem'],
        ]);

        $this->assertSame('recommended', $result['status']);
        $this->assertSame('<p>First problem</p><p>Second problem</p>', $result['description']);
        $this->assertStringContainsString('admin.php?page=loopress#dependencies', $result['actions']);
    }

    public function test_registered_test_turns_a_throwing_probe_into_an_issue(): void
    {
        $filter = null;
        Functions\when('add_filter')->alias(static function (string $hook, callable $callback) use (&$filter): void {
            $filter = $callback;
        });

        SiteHealth::register('loopress_x', 'Loopress X', 'code', static fn (): array => throw new \RuntimeException('probe down'));
        $tests  = $filter(['direct' => []]);
        $result = ($tests['direct']['loopress_x']['test'])();

        $this->assertSame('recommended', $result['status']);
        $this->assertStringContainsString('probe down', $result['description']);
    }
}
