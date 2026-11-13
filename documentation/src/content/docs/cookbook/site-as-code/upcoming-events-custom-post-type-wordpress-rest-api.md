---
title: "Upcoming Events in WordPress: Custom Post Type and REST API"
description: "Build a WordPress events catalog in Git: an event post type, an event type taxonomy, date and venue meta, and a REST route listing upcoming events by date."
kind: site
---

A venue, a school or a club wants its events on the site: the next three concerts on the home page, a "What's on" page, a headless front end or a newsletter tool asking what is coming up. A post type for the events is the easy part. The question every page asks, "which events have not happened yet, soonest first?", is the part WordPress does not answer: an event's date is not its publication date, and the core `/wp/v2/` endpoints sort by publication date and cannot filter on a meta value. So the dates end up as meta, and a small query of your own reads them.

This recipe builds the whole catalog as files in your repository, no events plugin and no Composer package:

- an `event` [post type](/custom-post-types/), with its own `/events/` URLs;
- an `event-type` [taxonomy](/taxonomies/) (Concert, Workshop...) attached to it;
- `start_date`, `end_date` and `venue` declared as [post meta](/post-meta/);
- a [Custom API Route](/api/routes/), `api/events/upcoming.php`, returning the events that have not ended yet, sorted by start date.

## The project

```
events-site/
  loopress.json
  cpt/
    event.json
  taxonomies/
    event-type.json
  meta/
    event.json
  api/
    events/
      upcoming.php
```

## The post type

```json title="cpt/event.json"
{
  "labels": {
    "name": "Events",
    "singular_name": "Event",
    "add_new_item": "Add Event",
    "search_items": "Search Events"
  },
  "public": true,
  "has_archive": true,
  "show_in_rest": true,
  "menu_icon": "dashicons-calendar-alt",
  "supports": ["title", "editor", "excerpt", "thumbnail", "custom-fields"],
  "rewrite": { "slug": "events" }
}
```

`custom-fields` in `supports` is what puts the meta keys below into the post type's REST response (`/wp/v2/event/<id>`), and gives editors the Custom fields panel to fill them in.

## The taxonomy

```json title="taxonomies/event-type.json"
{
  "object_type": ["event"],
  "labels": {
    "name": "Event Types",
    "singular_name": "Event Type"
  },
  "hierarchical": true,
  "show_in_rest": true,
  "show_admin_column": true,
  "rewrite": { "slug": "event-type" }
}
```

`object_type` attaches it to `event`. Only the taxonomy is versioned: its terms ("Concert", "Workshop") are content, created by editors, and Loopress never touches them.

## The dates and the venue

```json title="meta/event.json"
{
  "start_date": {
    "type": "string",
    "single": true,
    "show_in_rest": true,
    "description": "When the event starts, \"Y-m-d H:i:s\" in the site's timezone."
  },
  "end_date": {
    "type": "string",
    "single": true,
    "show_in_rest": true,
    "description": "When the event ends, \"Y-m-d H:i:s\" in the site's timezone: api/events/upcoming.php lists it until then."
  },
  "venue": {
    "type": "string",
    "single": true,
    "show_in_rest": true,
    "description": "Where the event takes place, free text."
  }
}
```

Post meta rather than ACF fields, for three reasons:

- it runs on both editions of the Loopress plugin, Loopress Light included, and needs no other plugin on the site;
- each key is registered with a type and exposed in REST, so a script or a front end can write and read events over `/wp/v2/event` without any code;
- the route below only needs `get_post_meta()` and a `meta_query`, which work the same whatever filled the value in.

To give editors a nicer form later, add an [ACF](/acf/) field group on the same keys: `lps meta` declares, ACF edits.

The dates are stored as `Y-m-d H:i:s` in the site's timezone (`2026-12-12 19:00:00`). That format sorts as text and casts as a MySQL `DATETIME`, which is what lets the database do the filtering and the sorting.

## The route

```php title="api/events/upcoming.php"
<?php

declare(strict_types=1);

// Lists the events that have not ended yet, soonest first, for a theme, a headless front end or
// a newsletter. Mirrors the cookbook recipe at
// https://docs.loopress.dev/cookbook/site-as-code/upcoming-events-custom-post-type-wordpress-rest-api/.
class UpcomingEvents
{
    private const MAX_PER_PAGE = 50;

    public function get(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $perPage = $request->get_param('per_page') ?? '10';
        if (!is_string($perPage) || !ctype_digit($perPage)) {
            return new WP_Error('invalid_per_page', 'per_page must be a whole number.', ['status' => 400]);
        }

        $page = $request->get_param('page') ?? '1';
        if (!is_string($page) || !ctype_digit($page) || (int) $page < 1) {
            return new WP_Error('invalid_page', 'page must be a whole number, 1 or more.', ['status' => 400]);
        }

        $query = [
            'post_type'      => 'event',
            'post_status'    => 'publish',
            'posts_per_page' => max(1, min(self::MAX_PER_PAGE, (int) $perPage)),
            'paged'          => (int) $page,
            'no_found_rows'  => true,
            'meta_query'     => [
                // Still on: an event already started but not finished stays in the list.
                'not_ended' => [
                    'key'     => 'end_date',
                    'value'   => current_time('mysql'),
                    'compare' => '>=',
                    'type'    => 'DATETIME',
                ],
                'starts' => ['key' => 'start_date', 'type' => 'DATETIME'],
            ],
            'orderby' => ['starts' => 'ASC', 'ID' => 'ASC'],
        ];

        $type = $request->get_param('type');
        if ($type !== null) {
            $term = is_string($type) ? get_term_by('slug', $type, 'event-type') : false;
            if (!$term instanceof WP_Term) {
                return new WP_Error('invalid_type', 'No event type with that slug.', ['status' => 400]);
            }
            $query['tax_query'] = [['taxonomy' => 'event-type', 'terms' => $term->term_id]];
        }

        $events = array_map([$this, 'format'], (new WP_Query($query))->posts);

        $response = new WP_REST_Response($events);
        $response->header('Cache-Control', 'public, max-age=300');

        return $response;
    }

    // Published events are public, the route is too: a front end calls it without an account.
    public function permission(WP_REST_Request $request): bool
    {
        return true;
    }

    private function format(WP_Post $event): array
    {
        $types = get_the_terms($event, 'event-type');

        return [
            'id'         => $event->ID,
            'title'      => get_the_title($event),
            'link'       => get_permalink($event),
            'start_date' => $this->isoDate(get_post_meta($event->ID, 'start_date', true)),
            'end_date'   => $this->isoDate(get_post_meta($event->ID, 'end_date', true)),
            'venue'      => (string) get_post_meta($event->ID, 'venue', true),
            'types'      => is_array($types) ? wp_list_pluck($types, 'slug') : [],
        ];
    }

    // "2026-12-05 19:30:00" in the site's timezone to "2026-12-05T19:30:00+01:00". An empty or
    // malformed value gives null, never a made-up date.
    private function isoDate(mixed $value): ?string
    {
        $date = is_string($value) ? DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $value, wp_timezone()) : false;

        return $date === false ? null : $date->format(DATE_ATOM);
    }
}
```

What it does, and why:

- **"Upcoming" means not ended yet.** The filter is on `end_date`, so a festival that started yesterday and ends tomorrow is still listed. Sorting is on `start_date`, through the named `starts` clause of the `meta_query`, with the post id as a tie-breaker.
- **`current_time('mysql')`** is "now" in the site's timezone, the same timezone the dates are stored in.
- **`permission()` returns `true`**: published events are public, and a front end calls the route without an account. Only `publish` events are queried, so a draft never leaks.
- **Inputs are checked**: `per_page` must be a whole number and is clamped to 1 to 50, `page` (for the events after the first `per_page`) a whole number from 1, `type` an existing `event-type` slug. Anything else answers `400`.
- **A date that is empty or not in the `Y-m-d H:i:s` format comes back as `null`**, never as a made-up date.
- **`Cache-Control: public, max-age=300`** lets a CDN or the browser keep the list for five minutes.

## Push it, in order

```bash
lps cpt push
lps taxonomy push
lps meta push
lps api push
```

The post type goes first, since the taxonomy attaches to it and the meta keys belong to it, and the route goes last, since it queries all three. [`lps push`](/workflow/#lps-push) runs these steps in exactly this order in one command, skipping the resources the project does not have:

```bash
lps push
```

## Try it

Events and terms are content: a fresh site has none, and the route answers `[]`. Create a few with WP-CLI, one past and two future. The dates below are the ones of the run shown further down: pick dates after today for the two future events.

```bash
wp term create event-type Concert --slug=concert
wp term create event-type Workshop --slug=workshop

wp post create --post_type=event --post_status=publish --post_title="Spring Jazz Night" \
  --meta_input='{"start_date":"2026-03-14 20:00:00","end_date":"2026-03-14 23:00:00","venue":"Le Petit Bain, Paris"}' --porcelain
wp post create --post_type=event --post_status=publish --post_title="WordPress Theme Workshop" \
  --meta_input='{"start_date":"2027-02-06 09:30:00","end_date":"2027-02-06 17:00:00","venue":"La Cantine, Nantes"}' --porcelain
wp post create --post_type=event --post_status=publish --post_title="Winter Choir Concert" \
  --meta_input='{"start_date":"2026-12-12 19:00:00","end_date":"2026-12-12 21:00:00","venue":"Saint-Eustache, Paris"}' --porcelain
```

Then attach each event to its type (`wp post term set <id> event-type concert`), or pick it in the editor.

On November 13, 2026, on a site in UTC, the route lists the two future events, the December concert first, although it was created last:

```bash
curl https://example.com/wp-json/loopress-api/v1/events/upcoming
```

```json
[
  {
    "id": 7,
    "title": "Winter Choir Concert",
    "link": "https://example.com/events/winter-choir-concert/",
    "start_date": "2026-12-12T19:00:00+00:00",
    "end_date": "2026-12-12T21:00:00+00:00",
    "venue": "Saint-Eustache, Paris",
    "types": ["concert"]
  },
  {
    "id": 6,
    "title": "WordPress Theme Workshop",
    "link": "https://example.com/events/wordpress-theme-workshop/",
    "start_date": "2027-02-06T09:30:00+00:00",
    "end_date": "2027-02-06T17:00:00+00:00",
    "venue": "La Cantine, Nantes",
    "types": ["workshop"]
  }
]
```

`?type=workshop` keeps only the workshop, `?per_page=1` only the next event, `?per_page=1&page=2` the one after it. An unknown type or a `per_page` that is not a number is refused:

```bash
curl "https://example.com/wp-json/loopress-api/v1/events/upcoming?type=nope"
# {"code":"invalid_type","message":"No event type with that slug.","data":{"status":400}}
```

The same events are also readable and writable through the core endpoint, `/wp/v2/event`, with their `meta` and `event-type`: that is how an import script or a test creates them.
