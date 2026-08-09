---
title: Sending Transactional Email from WordPress with Postmark
description: A snippet that sends an order confirmation through Postmark's API the moment payment completes, hooked directly to WooCommerce, instead of wp_mail() or a route polled by something else.
kind: snippet
draft: true
---

An order completes and the customer needs a confirmation email. `wp_mail()` is the obvious first reach, it's built into core, but it sends through PHP's `mail()` function by default, which on most hosting means whatever local mail transfer agent happens to be configured, if one is configured at all. No delivery confirmation, no bounce handling, no way to know if the email actually arrived, and a real chance it lands in spam because the sending server has no reputation to speak of. For a transactional email a customer is actively expecting, that's not a safe default.

## Why this needs a package

Sending through a dedicated transactional email provider, Postmark here, means calling that provider's HTTP API instead of handing the message to local mail delivery. [`wildbit/postmark-php`](https://packagist.org/packages/wildbit/postmark-php) is Postmark's own SDK, it wraps the API call, authentication, and response handling instead of hand-building HTTP requests against Postmark's API shape.

## The snippet

Payment completing is already a WordPress-native event, WooCommerce fires it the moment any gateway confirms payment, Stripe, PayPal, whichever one is active. A [snippet](/snippets/) hooked to `woocommerce_payment_complete` sends the email right there, instead of a separate route waiting for something else to call it:

```php title="snippets/send-order-receipt.php"
require_once WP_CONTENT_DIR . '/loopress/vendor/autoload.php';

use Postmark\PostmarkClient;

add_action('woocommerce_payment_complete', function (int $orderId): void {
    $to = (string) get_post_meta($orderId, '_billing_email', true);
    if ($to === '') {
        return;
    }

    $total = get_post_meta($orderId, '_order_total', true);

    try {
        $client = new PostmarkClient((string) get_option('postmark_server_token'));

        // TODO: verify sendEmail()'s exact parameter order and names against
        // wildbit/postmark-php's current docs before shipping this, it takes several
        // optional positional parameters (tag, trackOpens, replyTo, and more) beyond the
        // five shown here.
        $client->sendEmail(
            'orders@your-site.com',
            $to,
            "Order #{$orderId} confirmed",
            "<p>Thanks for your order. Total: {$total}</p>"
        );
    } catch (\Throwable $e) {
        // Catches a missing wildbit/postmark-php install the same way it catches an
        // actual send failure, an uncaught error here would otherwise interrupt
        // WooCommerce's own payment-complete handling, not just the receipt email.
        error_log("Postmark receipt failed for order {$orderId}: {$e->getMessage()}");
    }
});
```

```bash
composer require wildbit/postmark-php
lps composer push
lps snippet push
```

Keep the server token in an option, not hardcoded in the file, the same rule as any other credential in this series.

## Nothing to gate, and why that's fine

There's no `permission()` here, `woocommerce_payment_complete` only ever fires from inside WooCommerce's own payment confirmation, the same trust boundary as any other callback already hooked to it, an order confirmation email, a stock decrement. There's no separate caller to authenticate because there's no separate caller at all.

## Guard the whole callback, not just the API call

The `try`/`catch (\Throwable $e)` wraps building the Postmark client and sending the email together, not just the send call. A route only ever fails the one request it's answering, [isolated automatically](/api/routes/#failure-isolation) by Loopress, but a hook callback executes inline with whatever fired it. An uncaught error here, `wildbit/postmark-php` not installed, a bad option value, would surface as a fatal error in the middle of WooCommerce's own payment-complete handling, not just a failed email. Catching broadly and logging is what keeps this snippet's own failure from becoming WooCommerce's failure.

## What this opens up

The same pattern covers any transactional email currently sent through `wp_mail()` that actually needs to land reliably, password resets, shipping notifications, one hook, one SDK call. If the event that should trigger this happens outside WordPress, an external order system WordPress only mirrors, that's when a route with a shared secret is still the right tool: there's no WordPress hook to attach to for an event WordPress didn't originate.
