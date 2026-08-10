---
title: Exporting WooCommerce Orders to XLSX with PhpSpreadsheet
description: A Custom API Route that turns a WooCommerce orders query into a downloadable Excel file, using PhpSpreadsheet, for the client who just wants "the numbers in a spreadsheet."
kind: route
---

Somewhere in most WooCommerce projects, a client asks for a spreadsheet. Not a CSV they'll paste into Excel, an actual `.xlsx` file with a proper sheet name, formatted headers, and columns that don't need re-parsing. A monthly export of completed orders, one row per order with the total and the customer's email, exactly the kind of thing a store manager wants without touching wp-admin. Turning a list of orders into a real spreadsheet file is a different problem, and it's one core (or WooCommerce itself) has no opinion on.

## Why this needs a package

The `.xlsx` format is a zipped bundle of XML files with its own internal structure, sheets, shared strings, styles, relationships between parts. Writing one by hand is not a reasonable afternoon. [PhpSpreadsheet](https://packagist.org/packages/phpoffice/phpspreadsheet) (`phpoffice/phpspreadsheet`) is the standard PHP library for it, actively maintained, and it does the one thing this route needs: take cell values and produce valid `.xlsx` bytes.

## The route

Querying orders through `WP_Query` and reading `_order_total`/`_billing_email` as post meta is the older WooCommerce shape, one that assumes an order is stored as a post. Since WooCommerce's High-Performance Order Storage (HPOS), the default on new stores, orders live in their own database table instead of `wp_posts`, so that query silently returns nothing on a site using it. [`wc_get_orders()`](https://developer.woocommerce.com/docs/extensions/core-concepts/wc-get-orders/) is WooCommerce's own query function, it works the same way regardless of which storage a site has enabled, which matters here since a route pushed to a client's site has no control over that setting:

```php title="api/orders-export.php"
<?php

declare(strict_types=1);

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class OrdersExport
{
    public function get(): void
    {
        $orders = wc_get_orders([
            'status' => 'completed',
            'limit'  => -1,
        ]);

        $spreadsheet = new Spreadsheet();
        $sheet       = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Orders');
        $sheet->fromArray(['Order ID', 'Date', 'Total', 'Customer email'], null, 'A1');

        $row = 2;
        foreach ($orders as $order) {
            $sheet->fromArray([
                $order->get_id(),
                $order->get_date_created()?->format('Y-m-d'),
                $order->get_total(),
                $order->get_billing_email(),
            ], null, "A{$row}");
            $row++;
        }

        $filename = 'orders-' . gmdate('Y-m-d') . '.xlsx';

        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header("Content-Disposition: attachment; filename=\"{$filename}\"");
        header('Cache-Control: private, max-age=0, no-store');

        (new Xlsx($spreadsheet))->save('php://output');
        exit;
    }
}
```

```bash
composer require phpoffice/phpspreadsheet
lps composer push
```

`Xlsx::save()` normally takes a file path, but it accepts a writable stream just as well, `php://output` writes the file straight into the response body as it's generated, nothing held in memory or on disk beyond what PhpSpreadsheet itself needs to build the sheet. A `void` return and an explicit `exit` bypass WordPress's standard REST serialization on purpose, real headers and raw `.xlsx` bytes, not JSON, see [Streaming a file instead of JSON](/api/routes/#streaming-a-file-instead-of-json) for why a route file can do this at all.

`limit => -1` matches the "every completed order" goal here, but it also means loading every one into memory as a `WC_Order` object before the spreadsheet is even built. Fine for hundreds of orders, a store with a genuinely large order history should narrow this with a date range (`wc_get_orders()` accepts `date_created` the same way it accepts `status`) or paginate, neither shown here to keep the example focused.

## Now call it

```bash
curl https://your-site.com/wp-json/loopress-api/v1/orders-export \
  -u "admin:xxxx xxxx xxxx xxxx xxxx xxxx" \
  -o orders.xlsx
```

That writes an actual `orders.xlsx` to disk, `-o` instead of letting curl dump raw spreadsheet bytes to the terminal.

## Permission

This is unfiltered order and customer data, every row, all at once. There's no reasonable public case for it, so the route stays on the closed default rather than opening it up, stated explicitly so a reviewer sees the decision instead of assuming it:

```php
public function permission(WP_REST_Request $request): bool
{
    return current_user_can('manage_options');
}
```

## A missing package is a request-level error, not a caught one

If `phpoffice/phpspreadsheet` isn't installed, `new Spreadsheet()` is an undefined class, an ordinary PHP error on this one request. Loopress isn't in the business of catching that, it only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, once, before any route loads. A single package missing from an otherwise intact `vendor/` stays contained to the request that needed it, everything else on the site is unaffected, but push the package with [Composer dependency management](/composer/) before pushing a route that depends on it.

## What this opens up

Same shape, different query: product catalogs, subscriber lists, form submissions, anything a stakeholder wants "in Excel" instead of in the admin. It's also a narrow enough file, one query, one loop, one writer call, that handing it to an AI coding assistant to draft is a reasonable single-pass task, the contract (query the data, write it to the sheet, stream the file) leaves little room to wander.
