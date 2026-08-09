---
title: Bundling Multiple Files into One Download from a WordPress Route
description: A Custom API Route that zips every digital download attached to an order into a single file, using maennchen/zipstream-php, rather than making the customer download each file separately.
kind: route
draft: true
---

An order for a digital product bundle has five files attached to it, a PDF, three sample audio files, a license text. The confirmation page could list five separate download links, and often does, but "download everything" as one click is the better experience, and it isn't something WordPress or `WP_Query` produces on its own. `WP_Query` gets you the list of attachment IDs on the order, turning that into one zip file is a different, well-defined problem.

## Why this needs a package

The ZIP format has its own binary structure, local file headers, a central directory at the end, CRC32 checksums per entry. PHP's bundled `ZipArchive` (from the `zip` extension) can do it, but it needs a real file on disk to write to and read back, awkward for something built and returned in one request without touching the filesystem. [`maennchen/zipstream-php`](https://packagist.org/packages/maennchen/zipstream-php) builds a valid zip archive against any writable stream, including one that never leaves memory.

## The route

```php title="api/order-downloads/[order_id].php"
<?php

declare(strict_types=1);

use ZipStream\ZipStream;

class OrderDownloads
{
    public function get(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $orderId  = (int) $request->get_param('order_id');
        $fileIds  = get_post_meta($orderId, '_download_attachment_ids', true);

        if (!is_array($fileIds) || $fileIds === []) {
            return new WP_Error('no_files', 'This order has no digital downloads.', ['status' => 404]);
        }

        $stream = fopen('php://temp', 'r+');

        // TODO: verify the exact constructor parameter name for directing output to a
        // stream instead of straight to php://output against zipstream-php's current docs,
        // this one needs the archive kept in memory rather than echoed directly, since a
        // route's return value still has to go through WordPress's normal response handling.
        $zip = new ZipStream(outputStream: $stream, sendHttpHeaders: false);

        foreach ($fileIds as $attachmentId) {
            $path = get_attached_file((int) $attachmentId);
            if ($path !== false && file_exists($path)) {
                $zip->addFileFromPath(fileName: basename($path), path: $path);
            }
        }

        $zip->finish();
        rewind($stream);
        $bytes = stream_get_contents($stream);
        fclose($stream);

        $response = new WP_REST_Response([
            'filename' => "order-{$orderId}-downloads.zip",
            'content'  => base64_encode($bytes),
        ]);
        $response->header('Cache-Control', 'private, max-age=0, no-store');

        return $response;
    }
}
```

```bash
composer require maennchen/zipstream-php
lps composer push
```

ZipStream's whole reason to exist is writing an archive without buffering it fully in memory first, useful for a genuinely large bundle streamed straight to a browser. That specific advantage doesn't carry over cleanly into a route file: the response still has to be a value the route returns, base64 inside the documented JSON response shape, the same pattern as every other binary output in this series, not bytes echoed directly mid-request. The package still earns its place here for the simpler reason of building a correct zip archive without hand-rolling one, the streaming benefit just isn't the part being used.

## Now call it

```bash
curl https://your-site.com/wp-json/loopress-api/v1/order-downloads/482 \
  -u "admin:xxxx xxxx xxxx xxxx xxxx xxxx"
```

```json
{"filename": "order-482-downloads.zip", "content": "UEsDBBQAAAAIAA=="}
```

## Permission

Digital downloads are tied to the order that paid for them, same ownership model as [the invoice PDF route](/cookbook/documents-and-files/pdf-generation-tcpdf-wordpress-rest-api/) earlier in this series:

```php
public function permission(WP_REST_Request $request): bool
{
    if (current_user_can('manage_options')) {
        return true;
    }

    $orderId = (int) $request->get_param('order_id');
    return is_user_logged_in() && (int) get_post_meta($orderId, '_customer_id', true) === get_current_user_id();
}
```

## A missing package fails the one request, not the site

Without `maennchen/zipstream-php` installed, `ZipStream` is an undefined class, an ordinary PHP error on this one request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

The same shape covers any "give me everything at once" download, every invoice for a date range, every exported report for a project. It's also a narrow enough file, one loop, one archive, one permission check, that it's realistic to have an AI coding assistant draft it and review the ownership check yourself rather than trusting it blind.
