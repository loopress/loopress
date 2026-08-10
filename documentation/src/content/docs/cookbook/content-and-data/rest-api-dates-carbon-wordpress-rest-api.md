---
title: Fixing WordPress REST API Dates for a Headless Frontend with Carbon
description: A Custom API Route that returns unambiguous, correctly zoned post dates, using nesbot/carbon, because the core REST API's date and date_gmt fields don't tell a consuming frontend what timezone they're actually in.
kind: route
draft: true
---

The core REST API returns two dates for every post, `date` and `date_gmt`, and this is a genuinely recurring point of confusion for anyone building against `wp-json` for the first time: `date` is in the site's configured timezone, `date_gmt` is UTC, and neither field carries a timezone offset in its string, `2026-08-08T15:00:00` with nothing after it. A frontend rendering "published 3pm" for a visitor in a different timezone than the WordPress install has no reliable way to convert that without separately fetching the site's UTC offset and doing the math itself, and getting it wrong is silent: no error, just a timestamp that's off by however many hours the site and the visitor differ by.

## Why this needs a package

PHP's own `DateTime` can do the underlying math, but formatting it well, ISO 8601 with an actual offset, a "3 days ago"-style relative string, localized month names for a dozen languages, is enough boilerplate that most projects reach for a library rather than write it themselves. [`nesbot/carbon`](https://packagist.org/packages/nesbot/carbon) is the standard one, a thin, well-tested wrapper around `DateTime` with exactly that kind of formatting built in.

## The route

```php title="api/posts-with-dates.php"
<?php

declare(strict_types=1);

use Carbon\Carbon;

class PostsWithDates
{
    public function get(WP_REST_Request $request): array
    {
        $posts = new WP_Query(['post_type' => 'post', 'posts_per_page' => 10]);

        return array_map(static function (WP_Post $post): array {
            // get_post_datetime() returns a real DateTimeImmutable already carrying the
            // site's configured timezone, which is what makes the offset below correct
            // instead of guessed.
            $published = Carbon::instance(get_post_datetime($post));

            return [
                'id'          => $post->ID,
                'title'       => $post->post_title,
                'published'   => $published->toIso8601String(), // includes the real offset
                'published_utc' => $published->clone()->utc()->toIso8601String(),
                'relative'    => $published->diffForHumans(),
            ];
        }, $posts->posts);
    }

    public function permission(): bool
    {
        return true;
    }
}
```

```bash
composer require nesbot/carbon
lps composer push
```

`get_post_datetime()` is WordPress's own function for getting a post's date as a real `DateTimeImmutable`, already aware of the site's timezone setting, which is the piece core's REST API response doesn't expose directly. Wrapping it in `Carbon::instance()` doesn't change what it represents, it adds the formatting: an ISO 8601 string with an actual offset a frontend can parse unambiguously, and `diffForHumans()` for the "3 days ago" copy a template would otherwise compute by hand.

## Now call it

```bash
curl https://your-site.com/wp-json/loopress-api/v1/posts-with-dates
```

```json
[{"id": 118, "title": "New pricing for Q3", "published": "2026-08-08T15:00:00+02:00", "published_utc": "2026-08-08T13:00:00+00:00", "relative": "1 day ago"}]
```

## Permission

Post dates are exactly as public as the posts themselves already are through `wp-json`, so this stays open, the same as [the featured products example](/blog/custom-wordpress-endpoint-without-writing-a-plugin/) earlier in this series.

## A missing package fails the one request, not the site

Without `nesbot/carbon` installed, `Carbon` is an undefined class, an ordinary PHP error scoped to this request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

The same pattern applies to event start times, subscription renewal dates, anything where "which timezone is this actually in" matters and a frontend shouldn't have to guess. It's also a small, focused file, one query, one date transform per post, that's a reasonable one to have an AI coding assistant draft, the choice of `get_post_datetime()` over reading the raw `post_date` string being exactly the kind of detail worth checking rather than trusting a first pass on.
