---
title: Generating a Ticket QR Code from a WordPress Route with Endroid QR Code
description: A Custom API Route that renders a scannable QR code for an event ticket on request, using endroid/qr-code, instead of generating and storing an image file per ticket sold.
kind: route
draft: true
---

A site sells event tickets, one `ticket` custom post per purchase. Each ticket needs a QR code a scanner at the door reads to verify it, encoding a URL like `/verify-ticket/?ticket=482`. The tempting approach is generating a PNG at purchase time and storing it as an attachment, which works until the verification URL scheme changes, a domain migration, an added query parameter, and every previously generated image now encodes a dead link. Generating the QR code from the ticket's current data on every request instead means there's nothing to regenerate, the image is never stale because it's never stored.

## Why this needs a package

A QR code is a specific 2D barcode format with its own encoding rules, error correction levels, module sizing. [`endroid/qr-code`](https://packagist.org/packages/endroid/qr-code) is the standard PHP library for generating one, it turns a string into a PNG (or SVG, WebP, EPS) without the route needing to know anything about the QR spec itself.

## The route

```php title="api/ticket-qr/[ticket_id].php"
<?php

declare(strict_types=1);

use Endroid\QrCode\Builder\Builder;
use Endroid\QrCode\Writer\PngWriter;

class TicketQr
{
    public function get(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $ticketId = (int) $request->get_param('ticket_id');
        $ticket   = get_post($ticketId);

        if ($ticket === null || $ticket->post_type !== 'ticket') {
            return new WP_Error('not_found', 'No ticket with that id.', ['status' => 404]);
        }

        $verifyUrl = add_query_arg('ticket', $ticketId, home_url('/verify-ticket/'));

        // TODO: verify Builder's exact constructor parameters against endroid/qr-code's
        // current docs, the size/margin/errorCorrectionLevel options have shifted shape
        // across major versions of this library.
        $builder = new Builder(
            writer: new PngWriter(),
            data: $verifyUrl,
            size: 300,
            margin: 10,
        );

        $result = $builder->build();

        $response = new WP_REST_Response([
            'data_uri' => 'data:image/png;base64,' . base64_encode($result->getString()),
        ]);
        $response->header('Cache-Control', 'private, max-age=3600');

        return $response;
    }
}
```

```bash
composer require endroid/qr-code
lps composer push
```

The verification URL is built with `add_query_arg()` and `home_url()`, ordinary WordPress functions, the QR code just encodes whatever string they produce. If the domain or the verification path changes later, every ticket's QR code reflects it on the very next scan, nothing was ever baked into a stored image to go stale.

## Now call it

```bash
curl https://your-site.com/wp-json/loopress-api/v1/ticket-qr/482 \
  -u "admin:xxxx xxxx xxxx xxxx xxxx xxxx"
```

```json
{"data_uri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABLAAAASwAQMAAAC1..."}
```

## Permission

A ticket's QR code is effectively an entry credential, so it isn't public: the ticket's own owner or a site admin can request it, nobody else.

```php
public function permission(WP_REST_Request $request): bool
{
    if (current_user_can('manage_options')) {
        return true;
    }

    $ticketId = (int) $request->get_param('ticket_id');
    return is_user_logged_in() && (int) get_post_meta($ticketId, '_customer_id', true) === get_current_user_id();
}
```

## A missing package is scoped to this route

Without `endroid/qr-code` installed, `Builder` and `PngWriter` are undefined classes, an ordinary PHP error on this one request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

The same shape covers a Wi-Fi credential QR code for a venue, a link to a product page printed on packaging, anything where the encoded content is derived from live WordPress data rather than fixed at creation time. It's also a small enough contract, one lookup, one QR build, one permission check, that it's realistic to have an AI coding assistant draft it in a single pass and review the actual diff rather than the idea of it.
