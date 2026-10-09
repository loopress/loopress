<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Pushes;

use Brain\Monkey;
use Brain\Monkey\Filters;
use Brain\Monkey\Functions;
use Loopress\Pushes\PushLog;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;
use WP_REST_Response;

class PushLogTest extends TestCase
{
    /** @var array<string, mixed> In-memory wp_options. */
    private array $options = [];

    /** @var array<string, mixed> What each loopress/v1 GET route currently answers. */
    private array $routes = [];

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        Functions\when('get_option')->alias(fn (string $name, mixed $fallback = false): mixed => $this->options[$name] ?? $fallback);
        Functions\when('update_option')->alias(function (string $name, mixed $value): bool {
            $this->options[$name] = $value;
            return true;
        });
        Functions\when('wp_get_current_user')->justReturn((object) ['display_name' => 'Site Admin']);
        Functions\when('rest_get_authenticated_app_password')->justReturn(null);
        Functions\when('wp_json_encode')->alias(static fn (mixed $data): string|false => json_encode($data));
        Functions\when('rest_do_request')->alias(
            fn (WP_REST_Request $request): WP_REST_Response => new WP_REST_Response($this->routes[$request->get_route()] ?? null),
        );
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_record_logs_the_push_newest_first(): void
    {
        $log = new PushLog();
        $log->record('acf:push');
        $entry = $log->record('menu:push');

        $this->assertSame('Menus', $entry['label']);
        $this->assertSame('Site Admin', $entry['user']);
        $this->assertSame(['menu:push', 'acf:push'], array_column($log->summary()['entries'], 'resource'));
    }

    public function test_the_log_keeps_the_last_fifty_pushes(): void
    {
        $log = new PushLog();
        for ($i = 0; $i < 55; $i++) {
            $log->record('acf:push');
        }

        $this->assertCount(50, $log->summary()['entries']);
    }

    public function test_drift_is_false_until_the_resource_changes_outside_a_push(): void
    {
        $this->routes['/loopress/v1/menus'] = [['slug' => 'main', 'revision' => 'a']];
        $log = new PushLog();
        $log->record('menu:push');

        $this->assertFalse($log->summary()['resources'][0]['drift']);

        $this->routes['/loopress/v1/menus'] = [['slug' => 'main', 'revision' => 'b']];
        $this->assertTrue($log->summary()['resources'][0]['drift']);

        // A new push takes the changed state as the new baseline.
        $log->record('menu:push');
        $this->assertFalse($log->summary()['resources'][0]['drift']);
    }

    public function test_drift_is_unknown_for_a_resource_without_routes(): void
    {
        $log = new PushLog();
        $log->record('option:push');

        $resource = $log->summary()['resources'][0];
        $this->assertNull($resource['drift']);
        $this->assertSame('lps option push', $resource['command']);
    }

    public function test_each_resource_is_summarised_by_its_latest_push(): void
    {
        $log = new PushLog();
        $log->record('acf:push');
        $log->record('menu:push');
        $log->record('acf:push');

        $this->assertSame(['acf:push', 'menu:push'], array_column($log->summary()['resources'], 'resource'));
    }

    public function test_full_features_add_their_resources_through_the_filter(): void
    {
        Filters\expectApplied(PushLog::RESOURCES_FILTER)->andReturnUsing(
            static fn (array $resources): array => $resources + ['snippet:push' => ['label' => 'Snippets', 'routes' => [], 'screens' => ['wpcode']]],
        );

        $this->assertArrayHasKey('snippet:push', PushLog::resources());
        $this->assertSame('snippet:push', PushLog::resourceForScreen('toplevel_page_wpcode'));
    }

    public function test_native_screens_map_to_the_push_command_that_owns_them(): void
    {
        $this->assertSame('acf:push', PushLog::resourceForScreen('edit-acf-field-group'));
        $this->assertSame('acf:push', PushLog::resourceForScreen('acf-taxonomy'));
        $this->assertSame('menu:push', PushLog::resourceForScreen('nav-menus'));
        $this->assertSame('form:push', PushLog::resourceForScreen('wpforms_page_wpforms-builder'));
        $this->assertNull(PushLog::resourceForScreen('edit-post'));
    }

    public function test_last_push_is_null_for_a_resource_never_pushed(): void
    {
        $log = new PushLog();
        $log->record('acf:push');

        $this->assertNull($log->lastPush('menu:push'));
        $this->assertSame('acf:push', $log->lastPush('acf:push')['resource'] ?? null);
    }
}
