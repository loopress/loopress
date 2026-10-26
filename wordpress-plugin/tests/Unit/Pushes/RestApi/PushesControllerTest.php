<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Pushes\RestApi;

use Loopress\Tests\Stubs\FakeLockWpdb;
use Loopress\Tests\Stubs\RestRequest;
use Brain\Monkey;
use Loopress\Pushes\PushLog;
use Loopress\Pushes\RestApi\PushesController;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class PushesControllerTest extends TestCase
{
    private PushLog&MockObject $log;
    private PushesController $controller;
    private FakeLockWpdb $wpdb;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->log        = $this->createMock(PushLog::class);
        $this->controller = new PushesController($this->log);

        // record()'s named lock: granted unless a test says otherwise, every query recorded.
        $this->wpdb      = new FakeLockWpdb();
        $GLOBALS['wpdb'] = $this->wpdb;
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

        $response = $this->controller->record(RestRequest::with(['resource' => 'acf:push']));

        $this->assertSame(201, $response->status);
        $this->assertSame([
            "SELECT GET_LOCK('wp_loopress_push_log_record', 10)",
            "SELECT RELEASE_LOCK('wp_loopress_push_log_record')",
        ], $this->wpdb->queries);
    }

    public function test_answers_503_without_recording_when_another_push_holds_the_lock(): void
    {
        $this->wpdb->lockResult = '0';
        $this->log->expects($this->never())->method('record');

        $response = $this->controller->record(RestRequest::with(['resource' => 'acf:push']));

        $this->assertSame(503, $response->status);
    }
}
