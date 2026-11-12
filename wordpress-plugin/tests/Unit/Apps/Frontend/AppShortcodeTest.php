<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Apps\Frontend;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Apps\Frontend\AppAssetEnqueuer;
use Loopress\Apps\Frontend\AppShortcode;
use Loopress\Apps\Infrastructure\AppStore;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class AppShortcodeTest extends TestCase
{
    private AppStore&MockObject $store;
    private AppShortcode $shortcode;
    /** @var list<string> names whose assets were enqueued */
    private array $enqueued = [];

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->store = $this->createMock(AppStore::class);

        $enqueueStore = $this->createMock(AppStore::class);
        $enqueueStore->method('get')->willReturnCallback(function (string $name): ?array {
            $this->enqueued[] = $name;

            return null;
        });
        $this->shortcode = new AppShortcode($this->store, new AppAssetEnqueuer($enqueueStore));

        Functions\when('shortcode_atts')->alias(static fn(array $defaults, array $atts): array => array_merge($defaults, array_intersect_key($atts, $defaults)));
        Functions\when('sanitize_key')->alias(static fn(string $key): string => strtolower((string) preg_replace('/[^a-zA-Z0-9_\-]/', '', $key)));
        Functions\when('esc_attr')->returnArg();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_a_committed_app_prints_its_mount_point_and_enqueues_its_assets(): void
    {
        $this->store->method('get')->with('search')->willReturn(['buildId' => 'a1']);

        $html = $this->shortcode->render(['name' => 'search']);

        $this->assertSame('<div id="loopress-app-search" data-loopress-app="search"></div>', $html);
        $this->assertSame(['search'], $this->enqueued);
    }

    public function test_the_apps_mount_selector_gives_the_element_id(): void
    {
        $this->store->method('get')->willReturn(['mountSelector' => '#root']);

        $this->assertSame('<div id="root" data-loopress-app="search"></div>', $this->shortcode->render(['name' => 'search']));
    }

    public function test_a_shortcode_without_attributes_or_for_an_unknown_app_prints_a_hidden_comment_and_enqueues_nothing(): void
    {
        $this->store->method('get')->willReturn(null);

        $this->assertSame('<!-- loopress_app: no committed build for "" -->', $this->shortcode->render(''));
        $this->assertSame('<!-- loopress_app: no committed build for "ghost" -->', $this->shortcode->render(['name' => 'ghost']));
        $this->assertSame([], $this->enqueued);
    }
}
