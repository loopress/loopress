---
title: A Subscribable iCal Feed of WordPress Events with eluceo/ical
description: A Custom API Route that serves a site's events as a live .ics calendar feed, using eluceo/ical, so visitors subscribe once in Google Calendar or Apple Calendar instead of copying dates by hand.
kind: route
draft: true
---

A site lists upcoming events, one `event` post each, with a start, an end and a location stored as post meta. Visitors want them in their own calendar. An "Add to calendar" button per event covers one event at a time, and it goes stale the moment an event moves. A calendar feed covers all of them: the visitor subscribes to one URL once, and their calendar app fetches it again on its own schedule, so a rescheduled meetup shows up at its new time without anyone doing anything.

## Why this needs a package

An `.ics` file looks like plain text, and it is, but the format ([RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545)) has its own rules: commas and semicolons escaped inside values, long lines folded at 75 octets, a stable `UID` per event, date formats that change meaning depending on whether a time zone is attached. [`eluceo/ical`](https://packagist.org/packages/eluceo/ical) builds the file from plain PHP objects, and handles all of that itself.

## The route

```php title="api/events-calendar.php"
<?php

declare(strict_types=1);

use Eluceo\iCal\Domain\Entity\Calendar;
use Eluceo\iCal\Domain\Entity\Event;
use Eluceo\iCal\Domain\ValueObject\DateTime;
use Eluceo\iCal\Domain\ValueObject\Location;
use Eluceo\iCal\Domain\ValueObject\TimeSpan;
use Eluceo\iCal\Domain\ValueObject\UniqueIdentifier;
use Eluceo\iCal\Domain\ValueObject\Uri;
use Eluceo\iCal\Presentation\Factory\CalendarFactory;
use Loopress\Api\Attribute\Permission;

#[Permission(public: true)]
class EventsCalendar
{
    public function get(): void
    {
        $utc    = new DateTimeZone('UTC');
        $events = [];

        foreach (get_posts(['post_type' => 'event', 'post_status' => 'publish', 'numberposts' => 100]) as $post) {
            $start = get_post_meta($post->ID, 'event_start', true);
            $end   = get_post_meta($post->ID, 'event_end', true);

            if ($start === '' || $end === '') {
                continue;
            }

            $event = (new Event(new UniqueIdentifier('event-' . $post->ID . '@' . wp_parse_url(home_url(), PHP_URL_HOST))))
                ->setSummary(get_the_title($post))
                ->setUrl(new Uri(get_permalink($post)))
                ->setOccurrence(new TimeSpan(
                    new DateTime((new DateTimeImmutable($start, wp_timezone()))->setTimezone($utc), true),
                    new DateTime((new DateTimeImmutable($end, wp_timezone()))->setTimezone($utc), true),
                ));

            $location = get_post_meta($post->ID, 'event_location', true);
            if ($location !== '') {
                $event->setLocation(new Location($location));
            }

            $events[] = $event;
        }

        $calendar = (new CalendarFactory())->createCalendar(new Calendar($events));

        header('Content-Type: text/calendar; charset=utf-8');
        header('Content-Disposition: inline; filename="events.ics"');
        echo $calendar;
        exit;
    }
}
```

```bash
composer require eluceo/ical
lps composer push
```

The meta keys (`event_start`, `event_end`, `event_location`) are this example's own. An events plugin or an ACF field group stores the same information under its own keys, only the three `get_post_meta()` calls change.

A few choices worth knowing about:

- **Times are converted to UTC.** The meta values are read in the site's own time zone (`wp_timezone()`, from Settings > General), then written as UTC (`DTSTART:20261015T163000Z`). A `TZID=Europe/Paris` value would also be valid, but only alongside a `VTIMEZONE` block describing that zone's rules, which some calendar apps require and this route would then have to generate. UTC needs no such block, and every calendar app displays it in the viewer's own local time.
- **The `UID` is derived from the post id and the site's host**, so it never changes for a given event. That's what lets a calendar app recognize a rescheduled event as the same event, moved, instead of a new one next to a stale copy.
- **The route answers raw bytes, not JSON.** A void verb method that sets its own headers and calls `exit` is how a route [streams a file instead of JSON](/api/routes/#streaming-a-file-instead-of-json). Calendar apps never send an `Accept` header WordPress could use, they expect `text/calendar` straight away.

## Now subscribe to it

```bash
curl -i https://your-site.com/wp-json/loopress-api/v1/events-calendar
```

```text
HTTP/1.1 200 OK
Content-Type: text/calendar; charset=utf-8
Content-Disposition: inline; filename="events.ics"

BEGIN:VCALENDAR
PRODID:-//eluceo/ical//2.0/EN
VERSION:2.0
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:event-487@your-site.com
DTSTAMP:20260925T212944Z
SUMMARY:Headless Meetup #4
URL:https://your-site.com/event/headless-meetup-4/
DTSTART:20261015T163000Z
DTEND:20261015T190000Z
LOCATION:La Cordée\, Lyon
END:VEVENT
END:VCALENDAR
```

Note the escaped comma in `LOCATION`, one of the details the package handles for you. In Google Calendar, "Other calendars > From URL" takes the same address. On Apple devices, the same URL with `webcal://` instead of `https://` opens the subscription dialog directly, which makes a good link for a "Subscribe" button on the events page.

## Permission

A calendar app subscribing to a feed can't log in to WordPress, so the route is public: `#[Permission(public: true)]`. That's fine here because it only ever lists **published** events, the same information the events page already shows to any visitor. Drafts, private events and anything else behind a login never reach it. If a feed ever needs to be private (a members-only schedule), put a long random secret in the URL and check it in a [`permission()` method](/api/routes/#authentication-and-permissions), calendar apps can't send any other kind of credential.

## A missing package is scoped to this route

Without `eluceo/ical` installed, `Calendar` and `CalendarFactory` are undefined classes, an ordinary PHP error on this one request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

The same shape serves any schedule that already lives in WordPress: a venue's opening hours as recurring events, a course's session dates, a team's on-call rota kept as a custom post type. It pairs naturally with [ticket QR codes](/cookbook/documents-and-files/qr-code-generation-wordpress-rest-api/): one route puts the event in the attendee's calendar, the other gets them through the door.
