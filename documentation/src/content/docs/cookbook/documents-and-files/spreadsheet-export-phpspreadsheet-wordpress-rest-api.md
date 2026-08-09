---
title: Exporting WordPress Data to XLSX with PhpSpreadsheet
description: A Custom API Route that turns a WP_Query result into a downloadable Excel file, using PhpSpreadsheet, for the client who just wants "the numbers in a spreadsheet."
kind: route
draft: true
---

Somewhere in most WordPress projects, a client asks for a spreadsheet. Not a CSV they'll paste into Excel, an actual `.xlsx` file with a proper sheet name, formatted headers, and columns that don't need re-parsing. A monthly export of orders, a list of newsletter signups, whatever the data is, `WP_Query` gets it out of the database in an array. Turning that array into a real spreadsheet file is a different problem, and it's one core has no opinion on.

## Why this needs a package

The `.xlsx` format is a zipped bundle of XML files with its own internal structure, sheets, shared strings, styles, relationships between parts. Writing one by hand is not a reasonable afternoon. [PhpSpreadsheet](https://packagist.org/packages/phpoffice/phpspreadsheet) (`phpoffice/phpspreadsheet`) is the standard PHP library for it, actively maintained, and it does the one thing this route needs: take cell values and produce valid `.xlsx` bytes.

## The route

```php title="api/orders-export.php"
<?php

declare(strict_types=1);

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class OrdersExport
{
    public function get(): WP_REST_Response
    {
        $orders = new WP_Query([
            'post_type'      => 'shop_order',
            'posts_per_page' => -1,
            'post_status'    => 'wc-completed',
        ]);

        $spreadsheet = new Spreadsheet();
        $sheet       = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Orders');
        $sheet->fromArray(['Order ID', 'Date', 'Total', 'Customer email'], null, 'A1');

        $row = 2;
        foreach ($orders->posts as $order) {
            $sheet->fromArray([
                $order->ID,
                get_the_date('Y-m-d', $order),
                get_post_meta($order->ID, '_order_total', true),
                get_post_meta($order->ID, '_billing_email', true),
            ], null, "A{$row}");
            $row++;
        }

        $stream = fopen('php://temp', 'r+');
        (new Xlsx($spreadsheet))->save($stream);
        rewind($stream);
        $bytes = stream_get_contents($stream);
        fclose($stream);

        $response = new WP_REST_Response([
            'filename' => 'orders-' . gmdate('Y-m-d') . '.xlsx',
            'content'  => base64_encode($bytes),
        ]);
        $response->header('Cache-Control', 'private, max-age=0, no-store');

        return $response;
    }
}
```

```bash
composer require phpoffice/phpspreadsheet
lps composer push
```

`Xlsx::save()` normally takes a file path, but it accepts a writable stream just as well, `php://temp` keeps the file in memory (spilling to a temp file only past a few megabytes) instead of touching the disk for a file nobody needs to keep. As with any binary output from a route, the response carries it as base64 inside the JSON body, that's what going through WordPress's standard REST serialization (documented for both `array` and `WP_REST_Response` returns) predictably gets you, the frontend decodes it and offers the file as a download.

## Now call it

```bash
curl https://your-site.com/wp-json/loopress-api/v1/orders-export \
  -u "admin:xxxx xxxx xxxx xxxx xxxx xxxx"
```

```json
{"filename": "orders-2026-08-09.xlsx", "content": "UEsDBBQABgAIAAAAIQDfpNJzvgAAAJQBAAATAAgC..."}
```

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

Same shape, different query: product catalogs, subscriber lists, form submissions, anything a stakeholder wants "in Excel" instead of in the admin. It's also a narrow enough file, one query, one loop, one writer call, that handing it to an AI coding assistant to draft is a reasonable single-pass task, the contract (a `get()` returning a response) leaves little room to wander.
