---
title: Generating a PDF Invoice from a WordPress REST Route with TCPDF
description: A Custom API Route that builds an invoice PDF on the fly from order data, using TCPDF, no invoicing plugin, no file stored on disk.
kind: route
draft: true
---

A headless storefront shows an order confirmation page. Somewhere on it, a "Download invoice" button. On a normal WordPress/WooCommerce site that button is answered by an invoicing plugin, most of which exist only to turn order data into a PDF. On a headless setup there's no admin-rendered page for that plugin to hook into, the frontend just needs a URL that returns a PDF.

That's a small, well-defined piece of logic: read the order, lay out a document, return bytes. It doesn't need a plugin's settings screen, its own database table, or its own update cycle. It needs a PDF library.

## Why this needs a package

WordPress has no PDF renderer. `WP_Query` gives you the order (as a post, or a row in whatever order table your commerce plugin uses), but turning that data into a PDF, fonts, page geometry, a byte stream in the PDF format, is not something core or `WP_Query` does. [TCPDF](https://packagist.org/packages/tecnickcom/tcpdf) (`tecnickcom/tcpdf` on Packagist) has been the standard pure-PHP answer to that for years. It's currently in maintenance mode, the vendor points new projects at its successor `tecnickcom/tc-lib-pdf`, but TCPDF itself still ships fixes and its `\TCPDF` class API hasn't changed, which matters here since a route file is exactly the kind of small, self-contained code that isn't exposed to the parts of a library that get deprecated. [Composer Packages in a WordPress REST API Route](/blog/composer-packages-wordpress-rest-api-route/) covers how installing a package and using it in a route like this one actually connect.

## The route

```php title="api/invoice-pdf/[order_id].php"
<?php

declare(strict_types=1);

use TCPDF;

class InvoicePdf
{
    public function get(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $orderId = (int) $request->get_param('order_id');
        $order   = get_post($orderId);

        if ($order === null || $order->post_type !== 'shop_order') {
            return new WP_Error('order_not_found', 'No order with that id.', ['status' => 404]);
        }

        $pdf = new TCPDF();
        $pdf->SetCreator('Loopress');
        $pdf->SetAuthor(get_bloginfo('name'));
        $pdf->SetTitle("Invoice #{$orderId}");
        $pdf->setPrintHeader(false);
        $pdf->setPrintFooter(false);
        $pdf->AddPage();

        $total = get_post_meta($orderId, '_order_total', true);
        $pdf->writeHTML(
            "<h1>Invoice #{$orderId}</h1>" .
            '<p>' . esc_html(get_bloginfo('name')) . '</p>' .
            '<p>Total: ' . esc_html((string) $total) . '</p>'
        );

        // 'S' returns the PDF as a string instead of writing to disk or streaming to the browser.
        $bytes = $pdf->Output("invoice-{$orderId}.pdf", 'S');

        $response = new WP_REST_Response([
            'filename' => "invoice-{$orderId}.pdf",
            'content'  => base64_encode($bytes),
        ]);
        $response->header('Cache-Control', 'private, max-age=0, no-store');

        return $response;
    }
}
```

```bash
composer require tecnickcom/tcpdf
lps composer push
```

The response is JSON with a base64 field rather than a raw PDF byte stream: routes go through WordPress's standard REST serialization (an array or a `WP_REST_Response` body is JSON-encoded), so a base64 envelope is the documented, predictable way to carry binary content out, the frontend decodes it and triggers the download or renders it in a PDF viewer.

## Now call it

```bash
curl https://your-site.com/wp-json/loopress-api/v1/invoice-pdf/482 \
  -u "admin:xxxx xxxx xxxx xxxx xxxx xxxx"
```

```json
{"filename": "invoice-482.pdf", "content": "JVBERi0xLjcKJeLjz9MKMSAwIG9iago8PC9UeXBl..."}
```

## Permission

An invoice is financial data tied to one customer, not something the fresh-route default of "any administrator" is really answering, and definitely not something to leave public. This route only allows the order's own customer or a site admin:

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

## If TCPDF isn't installed

Push this route to a site where `tecnickcom/tcpdf` hasn't been installed through [Composer dependency management](/composer/) yet and the request hits an ordinary PHP error, `\TCPDF` is simply an undefined class, the same as calling any undefined class anywhere in PHP. Loopress doesn't catch that: it only catches a corrupted or missing `vendor/autoload.php` itself, [logged once](/api/routes/#failure-isolation), before any route loads. A single missing package inside an otherwise intact `vendor/` surfaces on the one request that needed it, every other route on the site keeps working. Push the package before you push the route.

## What this opens up

Once the route can read order data and TCPDF can lay it out, the same shape covers shipping labels, packing slips, membership certificates, anything that's "take some WordPress data, render it as a document." The file is small and its contract is narrow (one dynamic segment, one verb, one permission check), which also happens to make it a good target for an AI coding assistant to write correctly in a single pass, there's not much surface area for it to get wrong.
