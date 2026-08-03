---
title: Use a Composer Package Inside a Custom API Route, No Autoloader Required
description: Custom API Routes and Composer dependency management both ship with Loopress Full. Combined, a route file can `use` any installed package directly, no autoloader require, no plugin to write.
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
excerpt: You've installed a Composer package on WordPress through Loopress, and you've deployed a Custom API Route. Put them in the same file and one line most Composer-in-WordPress code needs disappears entirely.
---

Two Loopress Full features, each useful on their own: [Composer dependency management](/blog/wordpress-composer-without-ssh/) installs any Packagist package straight from the WordPress admin, and [Custom API Routes](/blog/custom-wordpress-endpoint-without-writing-a-plugin/) turn a version-controlled PHP file into a live REST endpoint. Used together, one of them gets noticeably simpler.

## The line you'd expect to write

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

```json
[{"title":"Weekender Backpack","link":"https://your-site.com/weekender-backpack/","priceUsd":89,"converted":{"currency":"EUR","amount":82.14}}]
```

`WP_Query` (or here, `get_posts()`) already covers anything the site itself holds. Guzzle earns its place the moment the data has to come from outside the site: a currency rate, a shipping quote, a weather advisory, an address geocoded before it's saved. That's the actual reason to reach for an HTTP client instead of the many other things on Packagist a route could just as easily `use`, a PDF generator, a CSV parser, a validation library, none of which touch the network at all.

## Same safety net as everywhere else

A package that fails to load, missing from `vendor/`, a corrupted autoloader, doesn't take the route down with it. It's [logged and skipped](/api/routes/#failure-isolation) exactly like a broken route file: that one endpoint stops responding, everything else on the site keeps working.

---

Both features ship with Loopress Full, free:

```bash
npm install -g @loopress/cli
```

[Composer dependency management](/composer/) covers installing and auditing packages from the admin. [Writing Route Files](/api/routes/) covers everything a route can do beyond this: authentication, CORS, the security model.
