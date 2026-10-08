<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Update\Infrastructure;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Update\Infrastructure\UsagePing;
use Loopress\Update\UsageStats;
use PHPUnit\Framework\TestCase;

class UsagePingTest extends TestCase
{
    /** @var array<string, mixed> */
    private array $options = [];

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->options = ['timezone_string' => 'Europe/Paris'];
        Functions\when('get_option')->alias(fn(string $name, mixed $fallback = false): mixed => $this->options[$name] ?? $fallback);
        Functions\when('update_option')->alias(function (string $name, mixed $value): bool {
            $this->options[$name] = $value;

            return true;
        });
        Functions\when('get_bloginfo')->justReturn('6.8');
        Functions\when('get_locale')->justReturn('fr_FR');
        Functions\when('wp_get_environment_type')->justReturn('production');
        Functions\when('wp_generate_uuid4')->justReturn('0b7c1f3e-8a5d-4c2b-9e6f-1a2b3c4d5e6f');
        Functions\when('wp_json_encode')->alias('json_encode');
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_payload_carries_only_technical_fields(): void
    {
        $this->assertSame([
            'installId' => '0b7c1f3e-8a5d-4c2b-9e6f-1a2b3c4d5e6f',
            'version'   => LOOPRESS_VERSION,
            'wp'        => '6.8',
            'php'       => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION,
            'locale'    => 'fr_FR',
            'timezone'  => 'Europe/Paris',
            'env'       => 'production',
        ], (new UsagePing())->payload());
    }

    public function test_install_id_is_generated_once_then_reused(): void
    {
        $first = (new UsagePing())->payload()['installId'];
        Functions\when('wp_generate_uuid4')->justReturn('another-uuid');

        $this->assertSame($first, (new UsagePing())->payload()['installId']);
        $this->assertSame($first, $this->options[UsagePing::INSTALL_ID_OPTION]);
    }

    public function test_send_posts_non_blocking_to_the_api(): void
    {
        Functions\expect('wp_remote_post')->once()->with(
            'https://api.loopress.dev/ping',
            \Mockery::on(static fn(array $args): bool => $args['blocking'] === false
                && $args['user-agent'] === 'Loopress/' . LOOPRESS_VERSION
                && json_decode($args['body'], true)['locale'] === 'fr_FR'),
        );

        (new UsagePing())->send();
        $this->addToAssertionCount(1);
    }

    public function test_send_is_capped_at_once_per_12_hours(): void
    {
        Functions\expect('wp_remote_post')->once();

        (new UsagePing())->send();
        (new UsagePing())->send();
        $this->options[UsagePing::LAST_SENT_OPTION] -= 12 * HOUR_IN_SECONDS - 1;
        (new UsagePing())->send();
        $this->addToAssertionCount(1);
    }

    public function test_send_goes_out_again_after_12_hours(): void
    {
        $this->options[UsagePing::LAST_SENT_OPTION] = time() - 12 * HOUR_IN_SECONDS;
        Functions\expect('wp_remote_post')->once();

        (new UsagePing())->send();
        $this->addToAssertionCount(1);
    }

    public function test_send_does_nothing_when_the_admin_opted_out(): void
    {
        $this->options[UsageStats::OPTION] = '0';
        Functions\expect('wp_remote_post')->never();

        (new UsagePing())->send();
        $this->addToAssertionCount(1);
    }

    public function test_send_is_enabled_by_default(): void
    {
        $this->assertTrue(UsageStats::isEnabled());
    }
}
