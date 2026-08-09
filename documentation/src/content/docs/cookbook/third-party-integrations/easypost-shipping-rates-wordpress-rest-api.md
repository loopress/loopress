---
title: Live Shipping Rates for a Headless Storefront with EasyPost
description: A Custom API Route that quotes real carrier shipping rates at checkout, using EasyPost's PHP SDK, for a headless commerce frontend that doesn't have WooCommerce's shipping-zone UI to fall back on.
kind: route
draft: true
---

A checkout page needs to show shipping cost before the customer commits to buying. WooCommerce answers this with shipping zones and flat or table-based rates configured in the admin, workable when WordPress renders the checkout page itself. A headless storefront, cart and checkout built in the frontend framework, WordPress used only for product data, doesn't have that UI to lean on, and a flat rate configured once is wrong in both directions: too high for a light item shipping locally, too low for a heavy one shipping across the country.

## Why this needs a package

Real shipping rates come from the carriers themselves, USPS, UPS, FedEx, each with its own API, its own account setup, its own request shape. [EasyPost](https://packagist.org/packages/easypost/easypost-php) (`easypost/easypost-php`) is a shipping API aggregator: one account, one API, rates back from multiple carriers for the same shipment, which is what makes "the checkout page shows a real rate" tractable from a single route instead of integrating each carrier separately.

## The route

```php title="api/shipping-rates.php"
<?php

declare(strict_types=1);

use EasyPost\EasyPostClient;

class ShippingRates
{
    public function post(WP_REST_Request $request): array|WP_Error
    {
        $toZip   = sanitize_text_field((string) $request->get_param('zip'));
        $weight  = (float) $request->get_param('weight_oz');

        if ($toZip === '' || $weight <= 0) {
            return new WP_Error('missing_fields', 'zip and weight_oz are required.', ['status' => 400]);
        }

        $client = new EasyPostClient((string) get_option('easypost_api_key'));

        $shipment = $client->shipment->create([
            'from_address' => [
                'zip' => (string) get_option('warehouse_zip'),
            ],
            'to_address' => [
                'zip' => $toZip,
            ],
            'parcel' => [
                'weight' => $weight,
            ],
        ]);

        $rates = array_map(static fn ($rate): array => [
            'carrier' => $rate->carrier,
            'service' => $rate->service,
            'rate'    => $rate->rate,
        ], $shipment->rates);

        return ['rates' => $rates];
    }

    public function permission(): bool
    {
        return true;
    }
}
```

```bash
composer require easypost/easypost-php
lps composer push
```

Only `zip` and `weight_oz` are collected here to keep the example readable, EasyPost's actual rate accuracy improves with full addresses and parcel dimensions, not just a zip code and a weight, worth the extra fields on a real checkout page.

## Now call it

```bash
curl -X POST https://your-site.com/wp-json/loopress-api/v1/shipping-rates \
  -H "Content-Type: application/json" \
  -d '{"zip":"94103","weight_oz":24}'
```

```json
{"rates": [{"carrier": "USPS", "service": "Priority", "rate": "8.45"}, {"carrier": "UPS", "service": "Ground", "rate": "11.20"}]}
```

## Permission

A shipping quote isn't customer-specific or sensitive, and it needs to work for a visitor who hasn't logged in yet, so this route stays open. It does spend a real EasyPost API call per request, worth keeping in mind: a checkout page firing this on every keystroke of a zip field rather than once it's complete is the kind of thing that turns into an unnecessary API bill.

## A missing package fails the one request, not the site

Without `easypost/easypost-php` installed, `EasyPostClient` is an undefined class, an ordinary PHP error scoped to this request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

The same client buys the label once an order is placed, not just quotes the rate, `$client->shipment->buy()` against the same shipment object. It's also a narrow file, one shipment built, one rate list returned, that's a reasonable one to have an AI coding assistant draft, the address fields actually collected being exactly the kind of tradeoff worth a deliberate call rather than trusting a first pass on.
