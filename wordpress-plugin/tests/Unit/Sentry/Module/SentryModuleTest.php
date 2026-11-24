<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Sentry\Module;

use Loopress\Sentry\Module\SentryModule;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Sentry\Event;
use Sentry\ExceptionDataBag;
use Sentry\Frame;
use Sentry\Context\OsContext;
use Sentry\Context\RuntimeContext;
use Sentry\Stacktrace;
use Sentry\UserDataBag;

class SentryModuleTest extends TestCase
{
    public function test_reports_events_originating_from_this_plugins_own_files(): void
    {
        $event = $this->eventWithFrameFile(LOOPRESS_PLUGIN_PATH . 'src/Sentry/Module/SentryModule.php');

        $this->assertTrue(SentryModule::isOwnEvent($event));
    }

    public function test_ignores_events_originating_from_outside_this_plugin(): void
    {
        $event = $this->eventWithFrameFile('/var/www/html/wp-content/themes/twentytwentyfour/functions.php');

        $this->assertFalse(SentryModule::isOwnEvent($event));
    }

    public function test_ignores_exceptions_with_no_stacktrace(): void
    {
        $event = Event::createEvent();
        $event->setExceptions([new ExceptionDataBag(new RuntimeException('boom'))]);

        $this->assertFalse(SentryModule::isOwnEvent($event));
    }

    public function test_scrub_drops_body_query_string_headers_and_server_name(): void
    {
        $event = Event::createEvent();
        $event->setServerName('web-01.client.example');
        $event->setUser(UserDataBag::createFromUserIpAddress('203.0.113.9'));
        $event->setRequest([
            'url'          => 'https://client.example/wp-json/loopress/v1/x?token=secret&email=a@b.c',
            'method'       => 'POST',
            'query_string' => 'token=secret&email=a@b.c',
            'data'         => ['password' => 'hunter2'],
            'headers'      => ['Authorization' => 'Basic abc', 'Cookie' => 'wordpress_logged_in=1'],
            'cookies'      => ['wordpress_logged_in' => '1'],
            'env'          => ['REMOTE_ADDR' => '203.0.113.9'],
        ]);

        $scrubbed = SentryModule::scrub($event);

        $this->assertNull($scrubbed->getServerName());
        $this->assertNull($scrubbed->getUser());
        $this->assertSame(
            ['method' => 'POST', 'url' => 'https://client.example/wp-json/loopress/v1/x'],
            $scrubbed->getRequest()
        );
    }

    public function test_scrub_drops_sdk_added_os_runtime_and_modules(): void
    {
        $event = Event::createEvent();
        $event->setOsContext(new OsContext('Linux', null, null, 'Linux web-01.client.example 6.1.0'));
        $event->setRuntimeContext(new RuntimeContext('php', '8.2.0'));
        $event->setModules(['vendor/package' => '1.0.0']);

        $scrubbed = SentryModule::scrub($event);

        $this->assertNull($scrubbed->getOsContext());
        $this->assertNull($scrubbed->getRuntimeContext());
        $this->assertSame([], $scrubbed->getModules());
    }

    private function eventWithFrameFile(string $file): Event
    {
        $event = Event::createEvent();
        $event->setExceptions([
            new ExceptionDataBag(new RuntimeException('boom'), new Stacktrace([new Frame(null, $file, 42)])),
        ]);

        return $event;
    }
}
