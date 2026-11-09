<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\SiteReport\RestApi;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\SiteReport\Infrastructure\ReportSender;
use Loopress\SiteReport\Module\SiteReportModule;
use Loopress\SiteReport\Service\ReportPayload;
use Loopress\SiteReport\RestApi\SiteTokenController;
use Loopress\SiteReport\SiteToken;
use Loopress\Tests\Stubs\RestRequest;
use Loopress\Tests\Unit\DigsIntoArrays;
use PHPUnit\Framework\TestCase;

class SiteTokenControllerTest extends TestCase
{
    use DigsIntoArrays;

    private const TOKEN = 'lps_site_0123456789abcdef0123456789abcdef';

    /** @var array<string, mixed> */
    private array $options = [];

    /** @var array<string, mixed>|\WP_Error */
    private array|\WP_Error $apiResponse = [];

    /** @var list<array<array-key, mixed>> */
    private array $posted = [];

    private bool $scheduled = false;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        Functions\when('home_url')->justReturn('https://example.com');
        Functions\when('get_option')->alias(fn(string $name, mixed $fallback = false): mixed => $this->options[$name] ?? $fallback);
        Functions\when('update_option')->alias(function (string $name, mixed $value): bool {
            $this->options[$name] = $value;

            return true;
        });
        Functions\when('delete_option')->alias(function (string $name): bool {
            unset($this->options[$name]);

            return true;
        });
        Functions\when('wp_json_encode')->alias('json_encode');
        Functions\when('is_wp_error')->alias(static fn(mixed $value): bool => $value instanceof \WP_Error);
        Functions\when('wp_remote_post')->alias(function (string $url, array $args): mixed {
            $this->posted[] = ['url' => $url] + $args;

            return $this->apiResponse;
        });
        Functions\when('wp_remote_retrieve_response_code')->alias(static fn(array $response): mixed => $response['code']);
        Functions\when('wp_remote_retrieve_body')->alias(static fn(array $response): mixed => $response['body']);
        Functions\when('wp_next_scheduled')->alias(fn(): int|false => $this->scheduled ? 1 : false);
        Functions\when('wp_schedule_event')->alias(function (int $time, string $recurrence, string $hook): bool {
            $this->assertSame('twicedaily', $recurrence);
            $this->assertSame(SiteReportModule::CRON_HOOK, $hook);
            $this->scheduled = true;

            return true;
        });
        Functions\when('wp_clear_scheduled_hook')->alias(function (): int {
            $this->scheduled = false;

            return 1;
        });
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    private function controller(): SiteTokenController
    {
        $payload = $this->createStub(ReportPayload::class);
        $payload->method('build')->willReturn(['url' => 'https://example.com']);

        return new SiteTokenController(new ReportSender($payload));
    }

    private function connect(string $token = self::TOKEN): \WP_REST_Response
    {
        return $this->controller()->connect(RestRequest::with(['token' => $token]));
    }

    public function test_connected_saves_the_token_schedules_the_report_and_masks_it(): void
    {
        $this->apiResponse = ['code' => 204, 'body' => ''];

        $response = $this->connect();

        $this->assertSame(200, $response->status);
        $this->assertSame([
            'result'       => 'connected',
            'connected'    => true,
            'token'        => 'lps_site_…cdef',
            'connectedUrl' => 'https://example.com',
            'url'          => 'https://example.com',
        ], $response->get_data());
        $this->assertSame(self::TOKEN, $this->options[SiteToken::OPTION]);
        $this->assertTrue($this->scheduled);
        $this->assertTrue($this->posted[0]['blocking']);
        $this->assertSame(5, $this->posted[0]['timeout']);
        $this->assertSame('https://api.loopress.dev/site-reports', $this->posted[0]['url']);
        $this->assertSame('Bearer ' . self::TOKEN, self::at($this->posted, 0, 'headers', 'Authorization'));
    }

    public function test_a_failed_scheduling_returns_500_and_keeps_no_token(): void
    {
        $this->apiResponse = ['code' => 204, 'body' => ''];
        Functions\when('wp_schedule_event')->justReturn(false);

        $response = $this->connect();

        $this->assertSame(500, $response->status);
        $this->assertArrayNotHasKey(SiteToken::OPTION, $this->options);
    }

    public function test_an_invalid_token_is_not_saved(): void
    {
        $this->apiResponse = ['code' => 401, 'body' => ''];

        $response = $this->connect();

        $this->assertSame(400, $response->status);
        $this->assertSame('invalid', self::at($response->get_data(), 'result'));
        $this->assertArrayNotHasKey(SiteToken::OPTION, $this->options);
        $this->assertFalse($this->scheduled);
    }

    public function test_a_token_of_another_site_names_that_site_and_is_not_saved(): void
    {
        $this->apiResponse = ['code' => 409, 'body' => '{"expected":"https://prod.example.com"}'];

        $response = $this->connect();

        $this->assertSame(409, $response->status);
        $this->assertSame('https://prod.example.com', self::at($response->get_data(), 'expected'));
        $this->assertStringContainsString('This token belongs to https://prod.example.com', self::stringAt($response->get_data(), 'error'));
        $this->assertArrayNotHasKey(SiteToken::OPTION, $this->options);
    }

    public function test_an_unreachable_api_keeps_the_token_for_the_cron_to_retry(): void
    {
        $this->apiResponse = new \WP_Error('http_request_failed', 'timeout');

        $response = $this->connect();

        $this->assertSame(200, $response->status);
        $this->assertSame('unreachable', self::at($response->get_data(), 'result'));
        $this->assertSame(self::TOKEN, $this->options[SiteToken::OPTION]);
        $this->assertTrue($this->scheduled);
    }

    public function test_a_malformed_token_never_reaches_the_api(): void
    {
        $response = $this->connect('lps_0123456789abcdef0123456789abcdef');

        $this->assertSame(400, $response->status);
        $this->assertSame([], $this->posted);
    }

    public function test_get_never_returns_the_token_in_clear(): void
    {
        $this->options[SiteToken::OPTION] = self::TOKEN;
        $this->options[SiteToken::URL_OPTION] = 'https://prod.example.com';

        $data = $this->controller()->get_state()->get_data();

        $this->assertSame('lps_site_…cdef', self::at($data, 'token'));
        $this->assertSame('https://prod.example.com', self::at($data, 'connectedUrl'));
        $this->assertStringNotContainsString(self::TOKEN, (string) json_encode($data));
    }

    public function test_disconnect_clears_the_token_and_the_event(): void
    {
        $this->options[SiteToken::OPTION] = self::TOKEN;
        $this->options[SiteToken::URL_OPTION] = 'https://example.com';
        $this->scheduled = true;

        $data = $this->controller()->disconnect()->get_data();

        $this->assertSame(['connected' => false, 'token' => null, 'connectedUrl' => null, 'url' => 'https://example.com'], $data);
        $this->assertSame([], $this->options);
        $this->assertFalse($this->scheduled);
    }
}
