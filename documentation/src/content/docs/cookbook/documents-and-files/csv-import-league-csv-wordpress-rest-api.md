---
title: Importing a Product CSV in a WordPress Route with League CSV
description: A Custom API Route that parses an uploaded CSV into draft products, row by row, with per-row error reporting, using league/csv instead of a naive fgetcsv() loop.
kind: route
draft: true
---

A supplier emails a CSV of their current catalog, SKU, name, price, twice a year, and it needs to become draft products in WordPress for someone to review and publish. `fgetcsv()` in a loop handles the easy case. It's the not-easy cases that cause the actual bugs: a product name containing a comma, correctly quoted in the file, that a naive `explode(',', $line)` would split on. A price field wrapped in quotes because it has a thousands separator. A blank trailing line at the end of the file that produces one broken "row" nobody wanted. None of these are exotic, they're what real supplier-exported CSVs actually look like.

## Why this needs a package

CSV looks like a trivial format and has just enough edge cases, quoting rules, escaped delimiters inside quoted fields, inconsistent line endings, that a hand-rolled parser tends to work on the sample file and break on the next one. [`league/csv`](https://packagist.org/packages/league/csv) is the standard PHP library for this, RFC 4180-aware parsing, and a `Reader` that exposes each row as an associative array keyed by the header line instead of a numeric array you have to remember the column order of.

## The route

```php title="api/import-products.php"
<?php

declare(strict_types=1);

use League\Csv\Reader;

class ImportProducts
{
    public function post(WP_REST_Request $request): array|WP_Error
    {
        $csv = (string) $request->get_param('csv');
        if ($csv === '') {
            return new WP_Error('missing_csv', 'No csv field in the request body.', ['status' => 400]);
        }

        // TODO: verify the exact factory method name against league/csv's current docs,
        // this has been Reader::createFromString() historically and the package has
        // renamed factory methods across major versions.
        $reader = Reader::createFromString($csv);
        $reader->setHeaderOffset(0);

        $created = [];
        $errors  = [];

        foreach ($reader->getRecords() as $offset => $record) {
            $sku   = trim($record['sku'] ?? '');
            $price = $record['price'] ?? '';

            if ($sku === '' || !is_numeric($price)) {
                $errors[] = "row {$offset}: missing sku or invalid price";
                continue;
            }

            $created[] = wp_insert_post([
                'post_type'   => 'product',
                'post_status' => 'draft',
                'post_title'  => trim($record['name'] ?? $sku),
                'meta_input'  => ['_sku' => $sku, '_price' => $price],
            ]);
        }

        return ['created' => $created, 'errors' => $errors];
    }

    public function permission(): bool
    {
        return current_user_can('manage_options');
    }
}
```

```bash
composer require league/csv
lps composer push
```

The route reports per-row errors instead of failing the whole import on the first bad row, one malformed price in a two-hundred-row file shouldn't cost the other one hundred ninety-nine, and the `errors` array is exactly what tells whoever ran the import which rows to go fix in the source file.

## Now call it

```bash
curl -X POST https://your-site.com/wp-json/loopress-api/v1/import-products \
  -u "admin:xxxx xxxx xxxx xxxx xxxx xxxx" \
  -H "Content-Type: application/json" \
  -d '{"csv":"sku,name,price\nWDG-001,Widget,12.50\nWDG-002,,not-a-price\n"}'
```

```json
{"created": [301], "errors": ["row 1: missing sku or invalid price"]}
```

## Permission

Bulk-creating draft posts from arbitrary input is an administrative action, this route stays on the closed default, stated here explicitly rather than left implicit:

```php
public function permission(): bool
{
    return current_user_can('manage_options');
}
```

## A missing package fails the one request, not the site

Without `league/csv` installed, `Reader` is an undefined class, an ordinary PHP error scoped to this request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

The same reader handles any recurring data drop, a supplier's inventory feed, a bank's transaction export, anything that arrives as "here's a spreadsheet" on some regular cadence. It's also a narrow enough file, one parse, one validation branch, one insert, that it's a reasonable one to have an AI coding assistant draft, with the per-row error handling being exactly the kind of behavior worth testing against a real, messy sample file rather than trusting a first pass on.
