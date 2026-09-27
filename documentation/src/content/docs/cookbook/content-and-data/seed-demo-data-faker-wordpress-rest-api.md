---
title: Seeding Realistic Demo Data on a Staging Site from a WordPress Route
description: A Custom API Route that generates a batch of realistic-looking fake products for QA and demos, using fakerphp/faker, instead of ten posts all named "Test Product".
kind: route
draft: true
---

QA on a staging site needs a product catalog with some actual shape to it, enough items to hit pagination, prices that vary instead of all being exactly $10.00, names that aren't `Test Product 1` through `Test Product 40`. Creating that by hand once is a chore, doing it again after every database reset is the kind of task that gets skipped, which is how staging ends up tested against three products forever while production has four thousand.

## Why this needs a package

Generating data that merely varies is easy, `rand()` and a scrambled string does that. Generating data that looks like what it's standing in for, plausible product names, realistic prices, real-shaped addresses, is a different problem, one [`fakerphp/faker`](https://packagist.org/packages/fakerphp/faker) already solves with curated generators for names, text, numbers, addresses, and dozens of other data shapes, actively maintained as the community-run continuation of the original `fzaninotto/faker`.

## The route

```php title="api/seed-demo-products.php"
<?php

declare(strict_types=1);

use Faker\Factory;

class SeedDemoProducts
{
    public function post(WP_REST_Request $request): array
    {
        $count = min(50, max(1, (int) ($request->get_param('count') ?: 10)));
        $faker = Factory::create();

        $created = [];
        for ($i = 0; $i < $count; $i++) {
            // WooCommerce's product API sets the regular price and the lookup tables a
            // bare `_price` meta would leave out (no price in the admin, invisible to sorting).
            $product = new WC_Product_Simple();
            $product->set_name(ucwords((string) $faker->words(3, true)));
            $product->set_regular_price((string) $faker->randomFloat(2, 5, 200));
            $product->set_status('publish');
            $created[] = $product->save();
        }

        return ['created' => $created];
    }

    public function permission(): bool
    {
        // Admin-only, and never on production: `lps push` sends every route file to
        // every environment, so the environment check has to live in the route itself.
        return current_user_can('manage_options')
            && wp_get_environment_type() !== 'production';
    }
}
```

```bash
composer require fakerphp/faker
lps composer push
```

The `count` parameter is clamped between 1 and 50 before it's used, an unclamped one would let a single request create an unbounded number of posts, cheap to write and expensive to run.

## Now call it

```bash
curl -X POST https://your-site.com/wp-json/loopress-api/v1/seed-demo-products \
  -u "admin:xxxx xxxx xxxx xxxx xxxx xxxx" \
  -H "Content-Type: application/json" \
  -d '{"count":10}'
```

```json
{"created": [201, 202, 203, 204, 205, 206, 207, 208, 209, 210]}
```

## Permission, and the environment question underneath it

`current_user_can('manage_options')` keeps this out of reach of anyone but an admin, the standard bar for anything mutating content in bulk. It doesn't answer a different question: whether this route should work on production at all. It shouldn't, and it can't be left out of production by choice of files either: `lps api push` and `lps push` send every file in `api/` to whichever environment you target.

So the route checks where it's running. [`wp_get_environment_type()`](https://developer.wordpress.org/reference/functions/wp_get_environment_type/) is WordPress core, it returns `production` unless the site sets `WP_ENVIRONMENT_TYPE` to `local`, `development`, or `staging` in `wp-config.php`. Production answers `rest_forbidden` even to an administrator. The flip side of that default: a staging site that never set the constant is `production` too, and refuses to seed until it does, which is the safe way round.

## A missing package fails the one request, not the site

Without `fakerphp/faker` installed, `Faker\Factory` is an undefined class, an ordinary PHP error scoped to this request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

The same generator seeds customers, orders, reviews, anything a real QA pass needs enough volume and variety of to actually exercise. It's also a small, bounded file, one loop, one clamp, one permission check, that's a reasonable one to have an AI coding assistant draft, the clamp on `count` being exactly the kind of guard worth confirming is actually there rather than trusting a first pass on.
