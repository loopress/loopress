<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Update;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Update\UsageStats;
use Loopress\Update\UsageStatsNotice;
use PHPUnit\Framework\TestCase;

class UsageStatsNoticeTest extends TestCase
{
    /** @var array<string, mixed> */
    private array $options = [];

    private UsageStatsNotice $notice;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->options = [];
        $_GET          = [];
        $this->notice  = new UsageStatsNotice();
        Functions\when('get_option')->alias(fn(string $name, mixed $fallback = false): mixed => $this->options[$name] ?? $fallback);
        Functions\when('update_option')->alias(function (string $name, mixed $value): bool {
            $this->options[$name] = $value;

            return true;
        });
        Functions\when('current_user_can')->justReturn(true);
        Functions\when('check_admin_referer')->justReturn(1);
        Functions\when('wp_unslash')->returnArg();
        Functions\when('sanitize_key')->returnArg();
        Functions\when('add_query_arg')->alias(static fn(string $key, string $value): string => "?{$key}={$value}");
        Functions\when('wp_nonce_url')->returnArg();
        Functions\when('esc_url')->returnArg();
        Functions\when('esc_html__')->returnArg();
        Functions\when('__')->returnArg();
    }

    protected function tearDown(): void
    {
        $_GET = [];
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_render_asks_while_undecided(): void
    {
        $this->expectOutputRegex('/loopress_usage_stats=1.*Keep it on.*loopress_usage_stats=0.*Turn it off/');

        $this->notice->render();
    }

    public function test_render_stays_silent_once_decided(): void
    {
        $this->options[UsageStats::OPTION] = '0';
        $this->expectOutputString('');

        $this->notice->render();
    }

    public function test_render_stays_silent_for_non_admins(): void
    {
        Functions\when('current_user_can')->justReturn(false);
        $this->expectOutputString('');

        $this->notice->render();
    }

    public function test_answers_are_stored_as_0_or_1(): void
    {
        $_GET['loopress_usage_stats'] = '0';
        $this->notice->handleAnswer();
        $this->assertSame(0, $this->options[UsageStats::OPTION]);

        $_GET['loopress_usage_stats'] = '1';
        $this->notice->handleAnswer();
        $this->assertSame(1, $this->options[UsageStats::OPTION]);
    }

    public function test_answer_is_ignored_without_the_arg_or_the_capability(): void
    {
        Functions\expect('check_admin_referer')->never();
        $this->notice->handleAnswer();

        $_GET['loopress_usage_stats'] = '0';
        Functions\when('current_user_can')->justReturn(false);
        $this->notice->handleAnswer();

        $this->assertArrayNotHasKey(UsageStats::OPTION, $this->options);
    }
}
