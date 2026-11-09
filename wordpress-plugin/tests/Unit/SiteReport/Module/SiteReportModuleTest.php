<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\SiteReport\Module;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\SiteReport\Module\SiteReportModule;
use Loopress\SiteReport\SiteToken;
use Loopress\Tests\Unit\DigsIntoArrays;
use PHPUnit\Framework\TestCase;

class SiteReportModuleTest extends TestCase
{
    use DigsIntoArrays;

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

    public function test_boot_never_reads_the_token(): void
    {
        Functions\expect('get_option')->never();
        Functions\expect('add_action')->once()->with('rest_api_init', \Mockery::type(\Closure::class));
        Functions\expect('add_action')->once()->with(SiteReportModule::CRON_HOOK, [SiteReportModule::class, 'report']);

        (new SiteReportModule())->boot();
        $this->addToAssertionCount(1);
    }

    public function test_schedules_twice_daily_once(): void
    {
        Functions\when('wp_next_scheduled')->justReturn(false);
        Functions\expect('wp_schedule_event')->once()->with(\Mockery::type('int'), 'twicedaily', SiteReportModule::CRON_HOOK);

        SiteReportModule::schedule();
        $this->addToAssertionCount(1);
    }

    public function test_does_not_schedule_twice(): void
    {
        Functions\when('wp_next_scheduled')->justReturn(1234);
        Functions\expect('wp_schedule_event')->never();

        SiteReportModule::schedule();
        $this->addToAssertionCount(1);
    }

    public function test_report_without_a_token_unschedules_itself(): void
    {
        Functions\when('get_option')->justReturn('');
        Functions\expect('wp_clear_scheduled_hook')->once()->with(SiteReportModule::CRON_HOOK);
        Functions\expect('wp_remote_post')->never();

        SiteReportModule::report();
        $this->addToAssertionCount(1);
    }

    public function test_report_with_a_token_posts_without_blocking(): void
    {
        Functions\when('get_option')->alias(static fn(string $name): string => $name === SiteToken::OPTION ? 'lps_site_abc' : '');
        Functions\when('home_url')->justReturn('https://example.com');
        Functions\when('get_bloginfo')->justReturn('6.8.3');
        Functions\when('get_site_transient')->justReturn(false);
        Functions\when('get_transient')->justReturn(false);
        Functions\when('get_plugins')->justReturn([]);
        Functions\when('wp_get_theme')->justReturn(new class() {
            public function get_stylesheet(): string
            {
                return 'twentytwentyfive';
            }

            public function get(): string
            {
                return '1.3';
            }
        });
        Functions\when('wp_json_encode')->alias('json_encode');
        Functions\expect('wp_clear_scheduled_hook')->never();
        Functions\expect('wp_remote_post')->once()->with(
            'https://api.loopress.dev/site-reports',
            \Mockery::on(static fn(array $args): bool => $args['blocking'] === false && self::at($args, 'headers', 'Authorization') === 'Bearer lps_site_abc'),
        );

        SiteReportModule::report();
        $this->addToAssertionCount(1);
    }
}
