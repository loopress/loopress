---
title: Caching an External API Call Behind a WordPress Route with Predis
description: A Custom API Route that caches an expensive external call in Redis using predis/predis, a pure-PHP client that doesn't need the ext-redis PHP extension.
kind: route
draft: true
---

A route on a headless storefront shows a live exchange rate next to a price. Fetched from a third-party API, that's one outbound HTTP call per page view, the frontend's response time now includes the third-party API's response time, and enough traffic eventually runs into that API's rate limit. The rate doesn't change every second. Caching it for a few minutes is the obvious fix, and WordPress's own object cache (`wp_cache_get()` / `wp_cache_set()`) is often backed by nothing more than a request-scoped array on hosts without a persistent object cache plugin configured, which caches nothing across requests at all.

## Why Redis, and why this particular client

Redis is the standard answer for a cache that needs to survive between requests and be shared across every PHP process a request might land on. The usual PHP client for it is the `redis` extension (phpredis), compiled into PHP itself, which is exactly the kind of server-level change most managed WordPress hosting doesn't give you. [`predis/predis`](https://packagist.org/packages/predis/predis) is a pure-PHP Redis client, it speaks the Redis protocol over a plain TCP socket, no PHP extension required. That fits how Loopress installs dependencies in the first place: a package lands in `wp-content/loopress/vendor/` from the admin, no SSH, no ability to recompile PHP. Predis being pure PHP means the client itself is never the blocker, only the network reachability of an actual Redis server is, and that's an infrastructure question, not something this route or Loopress solves for you.

## The route

```php title="api/exchange-rate/[currency].php"
<?php

declare(strict_types=1);

use GuzzleHttp\Client;
use Predis\Client as Redis;

class ExchangeRate
{
    public function get(WP_REST_Request $request): array
    {
        $currency = strtoupper((string) $request->get_param('currency'));
        $cacheKey = "exchange-rate:{$currency}";

        $redis = new Redis(['scheme' => 'tcp', 'host' => '127.0.0.1', 'port' => 6379]);

        $cached = $redis->get($cacheKey);
        if ($cached !== null) {
            return ['currency' => $currency, 'rate' => (float) $cached, 'cached' => true];
        }

        $client   = new Client();
        $response = $client->get("https://api.exchangerate.example/v1/latest/{$currency}");
        $rate     = (float) json_decode($response->getBody()->getContents(), true)['rate'];

        $redis->setex($cacheKey, 300, $rate); // 5 minutes

        return ['currency' => $currency, 'rate' => $rate, 'cached' => false];
    }

    public function permission(): bool
    {
        return true;
    }
}
```

```bash
composer require predis/predis
lps composer push
```

`new Redis(...)` doesn't open a connection by itself, Predis connects lazily on the first command, `get()` here. For a low-traffic route that's a fine default. For anything higher-traffic, opening a fresh TCP connection to Redis on every single request is real overhead worth avoiding, `'persistent' => true` in the connection parameters reuses one connection across requests on the same PHP-FPM worker instead of reconnecting every time.

## Now call it

```bash
curl https://your-site.com/wp-json/loopress-api/v1/exchange-rate/EUR
```

```json
{"currency": "EUR", "rate": 0.92, "cached": false}
```

## Permission

An exchange rate isn't sensitive, so this route is deliberately opened up rather than left on the closed default. The same shape with a computed aggregate instead, revenue for the last 30 days, say, would not get the same answer: cache the query, but keep the route behind `current_user_can('manage_options')` like any other route returning business data.

## A missing package or an unreachable Redis

Two different failure modes worth telling apart. If `predis/predis` isn't installed, `Predis\Client` is an undefined class, an ordinary PHP error scoped to this request, the same as any missing package: Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not an individual package inside an intact one. If the package is installed but no Redis server is reachable at that host and port, `$redis->get()` throws a connection exception, also not something Loopress catches, it's the route's own code now, so a production version of this route should catch that and fall back to calling the external API directly rather than failing the whole request over a cache being unavailable.

## What this opens up

Anything expensive and shared across users is a candidate: a slow aggregate query, a rate-limited third-party lookup, a computed value that doesn't need to be fresher than a few minutes. It's also a small enough file, one cache check, one fallback, one write, that it's realistic to have an AI coding assistant draft the first version and review the cache-key logic yourself rather than trusting it blind.
