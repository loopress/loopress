---
title: Import a CSV into WordPress with a REST Route and League CSV
description: Upload a supplier CSV to a WordPress REST route that parses it with league/csv, creates draft products and reports every rejected row, editors only.
kind: route
---

A supplier emails a CSV of their current catalog, SKU, name, price, twice a year, and it needs to become draft products in WordPress for someone to review and publish. `fgetcsv()` in a loop handles the easy case. It's the not-easy cases that cause the actual bugs: a product name containing a comma, correctly quoted in the file, that a naive `explode(',', $line)` would split on. A blank trailing line at the end of the file that produces one broken "row" nobody wanted. A price that is not a number. None of these are exotic, they're what real supplier-exported CSVs actually look like.

## Why this needs a package

CSV looks like a trivial format and has just enough edge cases, quoting rules, escaped delimiters inside quoted fields, inconsistent line endings, that a hand-rolled parser tends to work on the sample file and break on the next one. [`league/csv`](https://packagist.org/packages/league/csv) is the standard PHP library for this, RFC 4180-aware parsing, and a `Reader` that exposes each row as an associative array keyed by the header line instead of a numeric array you have to remember the column order of.

## The project

Products live in a `catalog-product` [custom post type](/custom-post-types/), so the project has the post type, the route and the package:

```text
csv-import/
├── api/
│   └── import-products.php
├── cpt/
│   └── catalog-product.json
├── composer.json
├── loopress.json
└── products.csv
```

```json title="cpt/catalog-product.json"
{
  "labels": {
    "name": "Catalog products",
    "singular_name": "Catalog product",
    "add_new_item": "Add Catalog product",
    "search_items": "Search Catalog products"
  },
  "public": false,
  "show_ui": true,
  "show_in_rest": true,
  "menu_icon": "dashicons-products",
  "supports": ["title"]
}
```

```json title="composer.json"
{
  "require": {
    "league/csv": "^9.27"
  }
}
```

The sample file is the messy kind: a quoted comma, an accent, one bad price and a blank line at the end.

```csv title="products.csv"
sku,name,price
WDG-001,"Widget, large",12.50
WDG-002,Café crème,8.00
WDG-003,Broken price,not-a-price

```

## The route

```php title="api/import-products.php"
<?php

declare(strict_types=1);

use League\Csv\Reader;

class ImportProducts
{
    private const MAX_ROWS = 1000;

    public function post(WP_REST_Request $request): array|WP_Error
    {
        $csv = (string) $request->get_param('csv');
        if ($csv === '') {
            return new WP_Error('missing_csv', 'No csv field in the request body.', ['status' => 400]);
        }

        try {
            $reader = Reader::fromString($csv);
            $reader->setHeaderOffset(0);
            $header = $reader->getHeader();
        } catch (Throwable) {
            return new WP_Error('invalid_csv', 'The csv could not be parsed.', ['status' => 400]);
        }

        if (array_diff(['sku', 'name', 'price'], $header) !== []) {
            return new WP_Error('invalid_header', 'The header row must contain sku, name and price.', ['status' => 400]);
        }

        // Refuse before creating anything: a file over the cap must not be half imported.
        if (count($reader) > self::MAX_ROWS) {
            return new WP_Error('too_many_rows', 'At most ' . self::MAX_ROWS . ' rows per import.', ['status' => 413]);
        }

        $created = [];
        $errors  = [];

        foreach ($reader->getRecords() as $offset => $record) {
            $sku   = trim((string) ($record['sku'] ?? ''));
            $name  = trim((string) ($record['name'] ?? ''));
            $price = trim((string) ($record['price'] ?? ''));

            if ($sku === '' || !is_numeric($price) || (float) $price < 0) {
                $errors[] = "row {$offset}: missing sku or invalid price";
                continue;
            }

            $existing = get_posts([
                'post_type'      => 'catalog-product',
                'post_status'    => 'any',
                'meta_key'       => '_sku',
                'meta_value'     => $sku,
                'fields'         => 'ids',
                'posts_per_page' => 1,
            ]);
            if ($existing !== []) {
                $errors[] = "row {$offset}: sku {$sku} already exists";
                continue;
            }

            $id = wp_insert_post([
                'post_type'   => 'catalog-product',
                'post_status' => 'draft',
                'post_title'  => $name !== '' ? $name : $sku,
                'meta_input'  => ['_sku' => $sku, '_price' => $price],
            ], true);

            if (is_wp_error($id)) {
                $errors[] = "row {$offset}: {$id->get_error_message()}";
                continue;
            }
            $created[] = $id;
        }

        return ['created' => $created, 'errors' => $errors];
    }

    public function permission(): bool
    {
        // Editors and above: bulk-creating drafts is an editorial action, not a site setting.
        return current_user_can('edit_others_posts');
    }
}
```

`Reader::fromString()` is the current factory, the `createFromString()` family is deprecated since league/csv 9.27. The reader skips the blank trailing line by itself, and a comma inside a quoted field stays in the field.

Push the package, the post type and the route, in that order, because the route looks the post type up:

```bash
lps composer push
lps cpt push
lps api push
```

The route reports per-row errors instead of failing the whole import on the first bad row, one malformed price in a two-hundred-row file shouldn't cost the other one hundred ninety-nine, and the `errors` array is exactly what tells whoever ran the import which rows to go fix in the source file. Rows are numbered by their position after the header, so `row 3` is the third product in the file. The SKU is the key: importing the same file twice creates nothing the second time.

This recipe stores a plain `_sku` and `_price` on a simple post type. If your catalog is WooCommerce, create the products with `WC_Product_Simple` instead of `wp_insert_post()`: it sets the regular price, keeps WooCommerce's lookup tables in sync and refuses duplicate SKUs itself.

## Now call it

The file is sent as a form field, so `curl` reads it straight from disk:

```bash
curl -X POST "https://your-site.com/wp-json/loopress-api/v1/import-products" \
  -u "editor:xxxx xxxx xxxx xxxx xxxx xxxx" \
  --data-urlencode csv@products.csv
```

The first import creates the two valid rows as drafts and rejects the third. The ids in `created` are whatever WordPress assigns on your site.

```json
{"created":[5,6],"errors":["row 3: missing sku or invalid price"]}
```

Sending the same file again, nothing is created:

```json
{"created":[],"errors":["row 1: sku WDG-001 already exists","row 2: sku WDG-002 already exists","row 3: missing sku or invalid price"]}
```

In the admin, the two products are drafts titled `Widget, large` and `Café crème`, the comma and the accent intact. A body with no `csv` field answers `400 missing_csv`, and a file whose header lacks `sku`, `name` or `price` answers `400 invalid_header`.

## Permission

Bulk-creating draft posts from arbitrary input is an editorial action, not a site setting, so the route is open to editors and above, not to `manage_options` only, and `subscriber` and anonymous callers are refused:

```php
public function permission(): bool
{
    return current_user_can('edit_others_posts');
}
```

A subscriber gets `403 rest_forbidden`, an anonymous caller `401`. The input is also bounded: the header is checked, a negative or non-numeric price is rejected, and a file over 1000 rows is refused with `413`, so one request cannot create an unbounded number of posts. See [Custom API routes](/api/routes/) for `permission()` and `#[Permission]`.

## A missing package fails the one request, not the site

Without `league/csv` installed, `Reader` is an undefined class, an ordinary PHP error scoped to this request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

The same reader handles any recurring data drop, a supplier's inventory feed, a bank's transaction export, anything that arrives as "here's a spreadsheet" on some regular cadence. It's also a narrow enough file, one parse, one validation branch, one insert, that it's a reasonable one to have an AI coding assistant draft, with the per-row error handling being exactly the kind of behavior worth testing against a real, messy sample file rather than trusting a first pass on.
