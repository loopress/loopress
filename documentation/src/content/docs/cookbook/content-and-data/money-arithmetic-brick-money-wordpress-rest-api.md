---
title: Computing a Price Quote Without Float Rounding Errors, in a WordPress Route
description: A Custom API Route that applies a discount and tax rate to a product price using brick/money's exact decimal arithmetic, instead of PHP floats.
kind: route
draft: true
---

A product costs 19.99. A route needs to return the price after a 15% discount, then tax applied on top. Written with plain PHP floats, `$price * 0.85 * 1.20`, that's a few keystrokes and it's wrong in a way that doesn't show up until it does: floats can't represent most decimal fractions exactly (`0.1 + 0.2` famously isn't `0.3` in PHP either), so a chain of percentage multiplications drifts by fractions of a cent, and money is the one domain where "close enough" is a bug report waiting to happen, a customer will notice a total that's a cent off, and an accountant definitely will.

## Why this needs a package

Fixing it by hand means rounding at every step, deciding how (banker's rounding, half-up, half-down), and doing it consistently everywhere money gets touched, easy to get right once and to quietly get wrong the second time someone adds a new price calculation elsewhere. [`brick/money`](https://packagist.org/packages/brick/money) represents an amount as an arbitrary-precision integer under a specific currency's decimal scale, not a float, and every arithmetic operation takes an explicit rounding mode, so drift isn't something that can happen silently.

## The route

```php title="api/quote/[product_id].php"
<?php

declare(strict_types=1);

use Brick\Math\RoundingMode;
use Brick\Money\Money;

class Quote
{
    public function get(WP_REST_Request $request): array|WP_Error
    {
        $productId = (int) $request->get_param('product_id');
        $priceRaw  = get_post_meta($productId, '_price', true);

        if (!is_numeric($priceRaw)) {
            return new WP_Error('no_price', 'This product has no price set.', ['status' => 404]);
        }

        $price = Money::of($priceRaw, 'USD');

        // TODO: verify against brick/money's current docs which operations actually require
        // an explicit RoundingMode argument versus which infer it, multipliedBy() with a
        // non-integer factor is shown here needing one, but the exact rule (tied to the
        // currency's minor unit scale) is worth confirming against the installed version.
        $discountPercent = min(100, max(0, (int) ($request->get_param('discount') ?: 0)));
        $discounted = $price->minus($price->multipliedBy($discountPercent / 100, RoundingMode::HALF_UP));

        $taxRate = 0.20; // 20% VAT, hardcoded here for the example, would come from site settings in practice
        $total   = $discounted->plus($discounted->multipliedBy($taxRate, RoundingMode::HALF_UP));

        return [
            'price'      => (string) $price,
            'discounted' => (string) $discounted,
            'total'      => (string) $total,
        ];
    }

    public function permission(): bool
    {
        return true;
    }
}
```

```bash
composer require brick/money
lps composer push
```

`(string) $price` renders as `"19.99 USD"`, the currency travels with the amount rather than being tracked separately in another field, one less place for a price and its currency to drift apart.

## Now call it

```bash
curl "https://your-site.com/wp-json/loopress-api/v1/quote/482?discount=15"
```

```json
{"price": "19.99 USD", "discounted": "16.99 USD", "total": "20.39 USD"}
```

## Permission

A price quote from a public product price isn't sensitive, this route stays open. The same shape computing a customer-specific negotiated price, or anything reading from an order rather than a public product, should not: that's the same closed-by-default, admin-or-owner pattern the [QR code](/cookbook/documents-and-files/qr-code-generation-wordpress-rest-api/) route in this series uses.

## A missing package fails the one request, not the site

Without `brick/money` installed, `Money::of()` is an undefined method on an undefined class, an ordinary PHP error scoped to this request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

Anywhere a WordPress site does its own price math instead of delegating to a commerce plugin's own (already-correct) calculations is a candidate: quotes, custom discount codes, multi-item totals. It's also a narrow enough contract, one price in, one computed total out, that it's reasonable to have an AI coding assistant draft it, with the rounding mode on each operation being exactly the kind of detail worth checking by hand rather than trusting a first pass on.
