<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Apps\Frontend;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Apps\Frontend\AppAssetEnqueuer;
use Loopress\Apps\Infrastructure\AppStore;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class AppAssetEnqueuerTest extends TestCase
{
    private const TAG        = '<script src="a.js"></script>'; // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedScript
    private const MODULE_TAG = '<script type="module" src="a.js"></script>'; // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedScript

    private AppStore&MockObject $store;
    private AppAssetEnqueuer $enqueuer;
    /** @var list<array{string, string, string|null}> */
    private array $styles = [];
    /** @var list<array{string, string, string|null}> */
    private array $scripts = [];
    /** @var list<array{string, string, array<mixed>}> */
    private array $localized = [];

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->store    = $this->createMock(AppStore::class);
        $this->enqueuer = new AppAssetEnqueuer($this->store);

        Functions\when('content_url')->alias(static fn(string $path): string => 'https://site.test/wp-content/' . $path);
        Functions\when('rest_url')->justReturn('https://site.test/wp-json/');
        Functions\when('esc_url_raw')->returnArg();
        Functions\when('wp_create_nonce')->justReturn('nonce123');
        Functions\when('wp_enqueue_style')->alias(function (string $handle, string $src, array $deps, ?string $ver): void {
            $this->styles[] = [$handle, $src, $ver];
        });
        Functions\when('wp_enqueue_script')->alias(function (string $handle, string $src, array $deps, ?string $ver): void {
            $this->scripts[] = [$handle, $src, $ver];
        });
        Functions\when('wp_localize_script')->alias(function (string $handle, string $name, array $data): void {
            $this->localized[] = [$handle, $name, $data];
        });
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_an_uncommitted_app_enqueues_nothing(): void
    {
        $this->store->method('get')->willReturn(null);

        $this->enqueuer->enqueue('search');

        $this->assertSame([], $this->scripts);
        $this->assertSame([], $this->styles);
        $this->assertSame([], $this->localized);
    }

    public function test_the_entry_files_are_enqueued_from_the_apps_folder_versioned_by_the_build_id(): void
    {
        $this->store->method('get')->willReturn([
            'buildId'       => '9f2a',
            'mountSelector' => '#mount',
            'entry'         => ['scripts' => ['/assets/index-1.js', 'assets/extra.js'], 'styles' => ['assets/index-1.css']],
        ]);

        $this->enqueuer->enqueue('my-app');

        $base = 'https://site.test/wp-content/loopress/apps/my-app/';
        $this->assertSame([['loopress-app-my-app-style-0', $base . 'assets/index-1.css', '9f2a']], $this->styles);
        $this->assertSame([
            ['loopress-app-my-app-script-0', $base . 'assets/index-1.js', '9f2a'],
            ['loopress-app-my-app-script-1', $base . 'assets/extra.js', '9f2a'],
        ], $this->scripts);
    }

    public function test_the_first_script_receives_the_apps_runtime_config(): void
    {
        $this->store->method('get')->willReturn(['buildId' => '9f2a', 'mountSelector' => '#mount', 'entry' => ['scripts' => ['a.js'], 'styles' => []]]);

        $this->enqueuer->enqueue('my-app');

        $this->assertSame([[
            'loopress-app-my-app-script-0',
            'loopressApp_my_app',
            [
                'name'      => 'my-app',
                'mount'     => '#mount',
                'base'      => 'https://site.test/wp-content/loopress/apps/my-app/',
                'buildId'   => '9f2a',
                'restUrl'   => 'https://site.test/wp-json/',
                'restNonce' => 'nonce123',
            ],
        ],
        ], $this->localized);
    }

    public function test_a_record_without_entry_or_build_id_enqueues_nothing_and_localizes_nothing(): void
    {
        $this->store->method('get')->willReturn(['buildId' => 12]);

        $this->enqueuer->enqueue('search');

        $this->assertSame([], $this->scripts);
        $this->assertSame([], $this->localized);
    }

    public function test_only_the_entry_scripts_become_modules(): void
    {
        $this->store->method('get')->willReturn(['entry' => ['scripts' => ['a.js'], 'styles' => []]]);
        $this->enqueuer->enqueue('app');

        $tag = self::TAG;
        $this->assertSame(self::MODULE_TAG, $this->enqueuer->filterModuleType($tag, 'loopress-app-app-script-0'));
        $this->assertSame($tag, $this->enqueuer->filterModuleType($tag, 'jquery'));
        $this->assertSame(self::MODULE_TAG, $this->enqueuer->filterModuleType(self::MODULE_TAG, 'loopress-app-app-script-0'));
    }
}
