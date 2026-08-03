---
title: Enrich WordPress Data With a Live External API, Using Composer in a Route
description: WP_Query already covers anything your site holds locally. A Custom API Route pulling in a Composer package is how you reach past that, a currency rate, a shipping quote, any data your site doesn't have.
date: 2026-08-03
draft: false
cliVersion: 0.20.1
wordpressPluginVersion: 2026.7.16
authors:
  - maxime
tags:
  - composer
  - rest api
  - wordpress
  - php
excerpt: A Custom API Route can hold real WordPress data and live data from somewhere else in the same response. Here's what that looks like, and the one line of Composer-in-WordPress boilerplate it skips along the way.
---

Two Loopress Full features, each useful on their own: [Composer dependency management](/blog/wordpress-composer-without-ssh/) installs any Packagist package straight from the WordPress admin, and [Custom API Routes](/blog/custom-wordpress-endpoint-without-writing-a-plugin/) turn a version-controlled PHP file into a live REST endpoint. Combined, a route can hand back WordPress data blended with data WordPress never had in the first place.

## Why reach for a package at all

`WP_Query` (or `get_posts()`) already covers anything the site itself holds: posts, pages, meta, taxonomies. A Composer package earns its place in a route the moment the data has to come from outside the site: a currency rate, a shipping quote, a weather advisory, an address geocoded before it's saved. An HTTP client is the obvious example, but it's not the only one, a PDF generator, a CSV parser, a validation library, anything on Packagist works the same way once it's inside a route file.

## The line you don't have to write

Using a Composer package anywhere else in WordPress, a snippet, `functions.php`, means loading the autoloader yourself first:

```php
require_once WP_CONTENT_DIR . '/loopress/vendor/autoload.php';

use GuzzleHttp\Client;
```

That line has to be there, in every file that touches a package, every time. Miss it and you get a fatal "Class not found" the moment the file runs.

## In a route file, it's not there

A Custom API Route already goes through Loopress's own loader before your code executes. That loader resolves the same `wp-content/loopress/vendor/` autoloader `lps composer push` fills, so a route file just uses a package like normal PHP:

```php
<?php

declare(strict_types=1);

use GuzzleHttp\Client;

class Webhook
{
    public function post(): array
    {
        $client = new Client();
        // ...
        return ['ok' => true];
    }
}
```

No `require_once`, no path to get wrong, no difference between this and any Composer project you've worked on. The full reference is in [Writing Route Files](/api/routes/#using-your-own-composer-dependencies).

## A complete example

The [reference demo project](https://github.com/loopress/demo) runs this end to end against a real WordPress instance in CI. `composer.json` installs `guzzlehttp/guzzle` alongside a WordPress.org plugin, the same file managing both a PHP library and a plugin:

```json
{
  "require": {
    "guzzlehttp/guzzle": "^7.0",
    "wpackagist-plugin/hello-dolly": "*"
  }
}
```

And `api/prices-in-currency.php` uses it to enrich real WordPress data, a `price` ACF field on pages, with a live rate from an external currency API, no API key required:

```php
<?php

declare(strict_types=1);

use GuzzleHttp\Client;

final class PricesInCurrency
{
    public function get(WP_REST_Request $request): array
    {
        $currency = strtoupper((string) ($request->get_param('currency') ?: 'EUR'));

        $client = new Client();
        $response = $client->get('https://api.frankfurter.app/latest', [
            'query' => ['from' => 'USD', 'to' => $currency],
        ]);
        $rate = json_decode((string) $response->getBody(), true)['rates'][$currency] ?? null;

        if ($rate === null) {
            return ['error' => "Unknown currency: {$currency}"];
        }

        $pages = get_posts([
            'post_type' => 'page',
            'meta_key' => 'price',
            'numberposts' => -1,
        ]);

        return array_map(static function (WP_Post $page) use ($rate, $currency): array {
            $priceUsd = (float) get_post_meta($page->ID, 'price', true);

            return [
                'title' => $page->post_title,
                'link' => get_permalink($page),
                'priceUsd' => $priceUsd,
                'converted' => ['currency' => $currency, 'amount' => round($priceUsd * $rate, 2)],
            ];
        }, $pages);
    }

    public function permission(): callable
    {
        return fn(): bool => true;
    }
}
```

Deploy both with the usual commands, in either order:

```bash
lps composer push
lps api push
```

```bash
curl "https://your-site.com/wp-json/loopress-api/v1/prices-in-currency?currency=EUR"
```

No page in the reference demo actually has a `price` set, so that specific instance answers `[]`, a correct, empty response, not a broken one. On a site with a "Consulting Retainer" page priced at 250 USD, the same route answers:

```json
[{"title":"Consulting Retainer","link":"https://your-site.com/consulting-retainer/","priceUsd":250,"converted":{"currency":"EUR","amount":230.25}}]
```

## Same safety net as everywhere else

A package that fails to load, missing from `vendor/`, a corrupted autoloader, doesn't take the route down with it. It's [logged and skipped](/api/routes/#failure-isolation) exactly like a broken route file: that one endpoint stops responding, everything else on the site keeps working.

---

Both features ship with Loopress Full, free:

```bash
npm install -g @loopress/cli
```

[Composer dependency management](/composer/) covers installing and auditing packages from the admin. [Writing Route Files](/api/routes/) covers everything a route can do beyond this: authentication, CORS, the security model.
