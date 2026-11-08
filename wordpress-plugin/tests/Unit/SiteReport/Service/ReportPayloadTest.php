<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\SiteReport\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\SiteReport\Service\ReportPayload;
use PHPUnit\Framework\TestCase;

class ReportPayloadTest extends TestCase
{
    /** @var array<string, mixed> */
    private array $siteTransients = [];

    private mixed $siteHealth = false;

    /** @var array<string, array{Version: string}> */
    private array $plugins = [];

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        Functions\when('home_url')->justReturn('https://example.com');
        Functions\when('get_bloginfo')->justReturn('6.8.3');
        Functions\when('get_site_transient')->alias(fn(string $name): mixed => $this->siteTransients[$name] ?? false);
        Functions\when('get_transient')->alias(fn(): mixed => $this->siteHealth);
        Functions\when('get_plugins')->alias(fn(): array => $this->plugins);
        Functions\when('is_plugin_active')->alias(static fn(string $file): bool => $file === 'woocommerce/woocommerce.php');
        Functions\when('wp_get_theme')->justReturn(new class() {
            public function get_stylesheet(): string
            {
                return 'twentytwentyfive';
            }

            public function get(string $header): string
            {
                return $header === 'Version' ? '1.3' : '';
            }
        });
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_reports_nulls_when_wordpress_knows_no_update_and_site_health_never_ran(): void
    {
        $this->plugins = ['woocommerce/woocommerce.php' => ['Version' => '10.2.1']];

        $this->assertSame([
            'url'        => 'https://example.com',
            'wordpress'  => '6.8.3',
            'php'        => PHP_VERSION,
            'loopress'   => LOOPRESS_VERSION,
            'coreUpdate' => null,
            'theme'      => ['slug' => 'twentytwentyfive', 'version' => '1.3', 'update' => null],
            'plugins'    => [['slug' => 'woocommerce', 'version' => '10.2.1', 'active' => true, 'update' => null]],
            'siteHealth' => null,
        ], (new ReportPayload())->build());
    }

    public function test_reads_pending_updates_and_site_health_from_the_transients(): void
    {
        $this->plugins = ['woocommerce/woocommerce.php' => ['Version' => '10.2.1']];
        $this->siteTransients = [
            'update_core'    => (object) ['updates' => [(object) ['response' => 'upgrade', 'current' => '6.9.0']]],
            'update_plugins' => (object) ['response' => ['woocommerce/woocommerce.php' => (object) ['new_version' => '10.3.0']]],
            'update_themes'  => (object) ['response' => ['twentytwentyfive' => ['new_version' => '1.4']]],
        ];
        $this->siteHealth = '{"good":18,"recommended":3,"critical":0}';

        $payload = (new ReportPayload())->build();

        $this->assertSame('6.9.0', $payload['coreUpdate']);
        $this->assertSame(['slug' => 'twentytwentyfive', 'version' => '1.3', 'update' => '1.4'], $payload['theme']);
        $this->assertSame([['slug' => 'woocommerce', 'version' => '10.2.1', 'active' => true, 'update' => '10.3.0']], $payload['plugins']);
        $this->assertSame(['good' => 18, 'recommended' => 3, 'critical' => 0], $payload['siteHealth']);
    }

    public function test_core_already_latest_is_not_an_update(): void
    {
        $this->siteTransients['update_core'] = (object) ['updates' => [(object) ['response' => 'latest', 'current' => '6.8.3']]];

        $this->assertNull((new ReportPayload())->build()['coreUpdate']);
    }

    public function test_a_single_file_plugin_is_named_after_its_file(): void
    {
        $this->plugins = ['hello.php' => ['Version' => '1.7.2']];

        $this->assertSame([['slug' => 'hello', 'version' => '1.7.2', 'active' => false, 'update' => null]], (new ReportPayload())->build()['plugins']);
    }

    public function test_plugins_are_capped(): void
    {
        for ($i = 0; $i < ReportPayload::MAX_PLUGINS + 10; $i++) {
            $this->plugins["plugin-{$i}/plugin.php"] = ['Version' => '1.0'];
        }

        $this->assertCount(ReportPayload::MAX_PLUGINS, (array) (new ReportPayload())->build()['plugins']);
    }
}
