<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\RestCache\Module;

use Brain\Monkey;
use Brain\Monkey\Actions;
use Brain\Monkey\Functions;
use Loopress\RestCache\Module\RestCacheModule;
use Loopress\Tests\Stubs\RestRequest;
use PHPUnit\Framework\TestCase;
use WP_REST_Response;
use WP_REST_Server;

class RestCacheModuleTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        Functions\when('sanitize_text_field')->returnArg();
        Functions\when('wp_unslash')->returnArg();
    }

    protected function tearDown(): void
    {
        unset($_SERVER['REQUEST_URI']);
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_boot_hooks_the_rest_response_and_litespeed(): void
    {
        (new RestCacheModule())->boot();

        $this->assertNotFalse(has_filter('rest_post_dispatch'));
        $this->assertNotFalse(has_action('litespeed_init'));
    }

    public function test_loopress_responses_are_marked_uncacheable(): void
    {
        $response = (new RestCacheModule())->addNoCacheHeaders(new WP_REST_Response([]), new WP_REST_Server(), new \WP_REST_Request('GET', '/loopress/v1/menus'));

        $this->assertSame([
            'X-LiteSpeed-Cache-Control' => 'no-cache',
            'Cache-Control'             => 'no-store, no-cache, must-revalidate',
            'Pragma'                    => 'no-cache',
        ], $response->get_headers());
    }

    public function test_other_plugins_responses_keep_their_caching(): void
    {
        $response = (new RestCacheModule())->addNoCacheHeaders(new WP_REST_Response([]), new WP_REST_Server(), new \WP_REST_Request('GET', '/wp/v2/posts'));

        $this->assertSame([], $response->get_headers());
    }

    public function test_litespeed_is_told_not_to_cache_loopress_rest_requests_only(): void
    {
        Actions\expectDone('litespeed_control_set_nocache')->once()->with('loopress REST API');
        $_SERVER['REQUEST_URI'] = '/wp-json/loopress/v1/menus';
        (new RestCacheModule())->litespeedNoCache();

        $_SERVER['REQUEST_URI'] = '/blog/';
        (new RestCacheModule())->litespeedNoCache();
        unset($_SERVER['REQUEST_URI']);
        (new RestCacheModule())->litespeedNoCache();

        // The expectation above fails the test on teardown if the action fired more or less than once.
        $this->addToAssertionCount(1);
    }
}
