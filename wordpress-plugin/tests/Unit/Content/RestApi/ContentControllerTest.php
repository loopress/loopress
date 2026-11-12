<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Content\RestApi;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Content\RestApi\ContentController;
use Loopress\Content\Service\ContentService;
use Loopress\Tests\Stubs\FakeContentWpdb;
use Loopress\Tests\Stubs\RestRequest;
use Loopress\Tests\Unit\CapturesRoutes;
use PHPUnit\Framework\TestCase;
use WP_REST_Response;

class ContentControllerTest extends TestCase
{
    use CapturesRoutes;

    private FakeContentWpdb $wpdb;
    private ContentController $controller;
    private string $environment = 'local';

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->wpdb      = new FakeContentWpdb();
        $GLOBALS['wpdb'] = $this->wpdb; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited

        Functions\when('get_post_types')->justReturn(['post' => 'post']);
        Functions\when('get_taxonomies')->justReturn(['category' => 'category']);
        Functions\when('home_url')->justReturn('https://local.test');
        Functions\when('wp_get_upload_dir')->justReturn(['baseurl' => 'https://local.test/uploads']);
        Functions\when('wp_get_environment_type')->alias(fn(): string => $this->environment);
        Functions\when('get_option')->justReturn(false);
        Functions\when('update_option')->justReturn(true);
        Functions\when('wp_cache_flush')->justReturn(true);
        Functions\when('clean_taxonomy_cache')->justReturn(null);
        Functions\when('is_serialized')->alias(static fn (string $value): bool => preg_match('/^[as]:\d+:/', $value) === 1);
        Functions\when('get_current_user_id')->justReturn(1);
        Functions\when('current_user_can')->alias(static fn(string $cap): bool => $cap === 'manage_options');
        $this->captureRoutes();

        $this->controller = new ContentController(new ContentService());
        $this->controller->register_routes();
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['wpdb']);
        Monkey\tearDown();
        parent::tearDown();
    }

    /** @param array<string, mixed> $params */
    private function call(string $route, string $method, array $params = [], mixed $json = null): WP_REST_Response
    {
        $handler = $this->handler($route, $method);
        $request = RestRequest::with($params);
        if ($json !== null) {
            $request->set_json_params($json);
        }
        $callback = $handler['callback'];
        $this->assertIsCallable($callback);
        $response = $callback($request);
        $this->assertInstanceOf(WP_REST_Response::class, $response);

        return $response;
    }

    public function test_every_route_requires_manage_options(): void
    {
        $this->assertSame(['/content', '/content/posts', '/content/reset', '/content/terms'], array_keys($this->sortedRoutes()));
        $this->assertGuardedByManageOptions();
    }

    /** @return array<string, list<array<mixed>>> */
    private function sortedRoutes(): array
    {
        $routes = $this->routes;
        ksort($routes);

        return $routes;
    }

    private function firstQuery(): string
    {
        return (string) current($this->wpdb->queries);
    }

    public function test_get_content_describes_the_site(): void
    {
        $response = $this->call('/content', 'GET');

        $this->assertSame(200, $response->status);
        $this->assertSame('https://local.test', $this->field($response->get_data(), 'home'));
    }

    public function test_posts_are_paged_with_the_limit_capped_and_floored(): void
    {
        $this->call('/content/posts', 'GET', ['after' => '-4', 'limit' => '9999']);
        $this->assertStringContainsString('ID > 0', $this->firstQuery());
        $this->assertStringContainsString('LIMIT 500', $this->firstQuery());

        $this->wpdb->queries = [];
        $this->call('/content/posts', 'GET', ['after' => 12, 'limit' => 0]);
        $this->assertStringContainsString('ID > 12', $this->firstQuery());
        $this->assertStringContainsString('LIMIT 1', $this->firstQuery());

        $this->wpdb->queries = [];
        $this->call('/content/terms', 'GET');
        $this->assertStringContainsString('LIMIT 100', $this->firstQuery());
    }

    public function test_reset_needs_the_source_home_and_uploads_url(): void
    {
        foreach ([[], ['home' => 'https://prod.test'], ['home' => '', 'uploadsUrl' => 'u'], ['home' => 1, 'uploadsUrl' => 'u']] as $body) {
            $this->assertSame(400, $this->call('/content/reset', 'POST', [], $body)->status);
        }
        $this->assertSame(400, $this->call('/content/reset', 'POST', [], 'nope')->status);
    }

    public function test_reset_deletes_local_content_and_reports_the_counts(): void
    {
        $this->wpdb->columns = [['1', '2'], []];

        $response = $this->call('/content/reset', 'POST', [], ['home' => 'https://prod.test', 'uploadsUrl' => 'https://prod.test/up']);

        $this->assertSame(200, $response->status);
        $this->assertSame(['posts' => 2, 'terms' => 0], $response->get_data());
    }

    public function test_writes_are_forbidden_outside_a_local_site(): void
    {
        $this->environment = 'production';

        $this->assertSame(403, $this->call('/content/reset', 'POST', [], ['home' => 'h', 'uploadsUrl' => 'u'])->status);
        $this->assertSame(403, $this->call('/content/posts', 'POST', [], ['posts' => []])->status);
        $this->assertSame(403, $this->call('/content/terms', 'POST', [], ['terms' => []])->status);
        $this->assertSame([], $this->wpdb->inserted);
    }

    public function test_importing_posts_writes_them_and_counts_them(): void
    {
        $response = $this->call('/content/posts', 'POST', [], [
            'posts'             => [['ID' => 5, 'post_title' => 'Hello']],
            'postmeta'          => [['post_id' => 5, 'meta_key' => 'k', 'meta_value' => 'v']],
            'termRelationships' => [],
        ]);

        $this->assertSame(200, $response->status);
        $this->assertSame(['posts' => 1], $response->get_data());
        $this->assertSame(['wp_posts', 'wp_postmeta'], array_column($this->wpdb->inserted, 0));
    }

    public function test_importing_terms_writes_them_and_counts_them(): void
    {
        $response = $this->call('/content/terms', 'POST', [], ['terms' => [['term_id' => 2, 'name' => 'News']]]);

        $this->assertSame(200, $response->status);
        $this->assertSame(['terms' => 1], $response->get_data());
    }

    public function test_a_body_that_is_not_an_object_or_has_a_non_list_section_is_a_400(): void
    {
        $this->assertSame(400, $this->call('/content/posts', 'POST', [], 'text')->status);
        $this->assertSame(400, $this->call('/content/posts', 'POST', [], ['posts' => 'x'])->status);
        $this->assertSame(400, $this->call('/content/posts', 'POST', [], ['posts' => ['a' => ['ID' => 1]]])->status);
        $this->assertSame(400, $this->call('/content/posts', 'POST', [], ['posts' => [['no_id' => 1]]])->status);

        $response = $this->call('/content/terms', 'POST', [], ['termmeta' => 3]);
        $this->assertSame(400, $response->status);
        $this->assertSame('"termmeta" must be an array.', $this->field($response->get_data(), 'error'));
    }

    public function test_a_database_failure_is_a_500_with_its_message(): void
    {
        $this->wpdb->failWrites = true;

        $response = $this->call('/content/posts', 'POST', [], ['posts' => [['ID' => 5]]]);

        $this->assertSame(500, $response->status);
        $this->assertSame('Could not write to wp_posts: disk full', $this->field($response->get_data(), 'error'));
    }

    private function field(mixed $data, string $key): mixed
    {
        $this->assertIsArray($data);

        return $data[$key] ?? null;
    }
}
