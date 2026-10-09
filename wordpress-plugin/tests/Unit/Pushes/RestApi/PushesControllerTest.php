<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Pushes\RestApi;

use Brain\Monkey;
use Loopress\Pushes\PushLog;
use Loopress\Pushes\RestApi\PushesController;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class PushesControllerTest extends TestCase
{
    private PushLog&MockObject $log;
    private PushesController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->log        = $this->createMock(PushLog::class);
        $this->controller = new PushesController($this->log);

        // record()'s named lock: granted unless a test says otherwise, every query recorded.
        $wpdb = new class() {
            public string $prefix = 'wp_';
            public string $lockResult = '1';
            /** @var string[] */
            public array $queries = [];

            public function prepare(string $query, mixed ...$args): string
            {
                return vsprintf(str_replace(['%s', '%d'], ["'%s'", '%d'], $query), $args);
            }

            public function get_var(string $query): string
            {
                $this->queries[] = $query;
                return $this->lockResult;
            }

            public function query(string $query): int
            {
                $this->queries[] = $query;
                return 1;
            }
        };
        $GLOBALS['wpdb'] = $wpdb;
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['wpdb']);
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_records_the_push_under_a_named_lock_and_releases_it(): void
    {
        $this->log->expects($this->once())->method('record')->with('acf:push')->willReturn(['resource' => 'acf:push']);

        $response = $this->controller->record(new WP_REST_Request(['resource' => 'acf:push']));

        $this->assertSame(201, $response->status);
        $this->assertSame([
            "SELECT GET_LOCK('wp_loopress_push_log_record', 10)",
            "SELECT RELEASE_LOCK('wp_loopress_push_log_record')",
        ], $GLOBALS['wpdb']->queries);
    }

    public function test_answers_503_without_recording_when_another_push_holds_the_lock(): void
    {
        $GLOBALS['wpdb']->lockResult = '0';
        $this->log->expects($this->never())->method('record');

        $response = $this->controller->record(new WP_REST_Request(['resource' => 'acf:push']));

        $this->assertSame(503, $response->status);
    }
}
