<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Sentry\Module;

use Loopress\Sentry\Module\SentryModule;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Sentry\Event;
use Sentry\ExceptionDataBag;
use Sentry\Frame;
use Sentry\Stacktrace;

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

    private function eventWithFrameFile(string $file): Event
    {
        $event = Event::createEvent();
        $event->setExceptions([
            new ExceptionDataBag(new RuntimeException('boom'), new Stacktrace([new Frame(null, $file, 42)])),
        ]);

        return $event;
    }
}
