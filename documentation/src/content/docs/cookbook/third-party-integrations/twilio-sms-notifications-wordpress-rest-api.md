---
title: Sending an SMS Order Update from WordPress with Twilio
description: A snippet that texts a customer the moment their order ships, hooked directly to WooCommerce's own status change, using Twilio's PHP SDK, for the update that actually gets read instead of the one sitting unopened in an inbox.
kind: snippet
draft: true
---

An order status changes to "shipped" and WordPress sends an email. Email open rates for shipping notifications are genuinely poor, spam filters, promotions tabs, an inbox the customer doesn't check on their phone, and by the time it's read (if it's read at all) the package may have already arrived. An SMS lands differently: it's read within minutes on nearly every delivery, which is exactly why shipping and appointment updates are one of the more common reasons a WordPress site ends up needing to send a text message, not an email, for one specific kind of update.

## Why this needs a package

Sending an SMS through Twilio means authenticating a request with an account SID and auth token, hitting the right endpoint for the account's region, and handling delivery failures (an invalid number, a carrier rejecting the message) with Twilio's own error codes. [`twilio/sdk`](https://packagist.org/packages/twilio/sdk) wraps that into a couple of method calls instead of hand-building raw HTTP requests against Twilio's API shape.

## The snippet

The status change this reacts to already happens inside WordPress, WooCommerce moving an order to a new status, so nothing external needs to trigger anything. A [snippet](/snippets/) hooked to `woocommerce_order_status_changed` fires the moment that happens:

```php title="snippets/order-shipped-sms.php"
require_once WP_CONTENT_DIR . '/loopress/vendor/autoload.php';

use Twilio\Rest\Client;

add_action('woocommerce_order_status_changed', function (int $orderId, string $from, string $to): void {
    if ($to !== 'completed') {
        return;
    }

    $phone = (string) get_post_meta($orderId, '_billing_phone', true);
    if ($phone === '') {
        return;
    }

    try {
        $client = new Client(
            (string) get_option('twilio_account_sid'),
            (string) get_option('twilio_auth_token')
        );

        $client->messages->create($phone, [
            'from' => (string) get_option('twilio_from_number'),
            'body' => "Order #{$orderId} has shipped.",
        ]);
    } catch (\Throwable $e) {
        // Catches a missing twilio/sdk install the same way it catches an actual send
        // failure, an uncaught error here would otherwise break whatever just changed
        // this order's status, not just the SMS.
        error_log("Twilio SMS failed for order {$orderId}: {$e->getMessage()}");
    }
}, 10, 3);
```

```bash
composer require twilio/sdk
lps composer push
lps snippet push
```

`$to !== 'completed'` is this store's actual "shipped" status, a store using a dedicated status from a shipping plugin instead should check for that slug, `woocommerce_order_status_changed` fires with whatever status the store actually uses, not a fixed list. The billing phone number is used as-is here for brevity, in practice it should go through the same E.164 normalization as [the phone validation route](/cookbook/content-and-data/phone-number-validation-wordpress-rest-api/) earlier in this series before it's stored, Twilio rejects numbers that aren't in that format rather than guessing at a local one.

## Nothing to gate, and why that's fine

There's no `permission()` here, the hook only ever fires from inside WordPress's own order-status transition, the same trust boundary as any other `woocommerce_order_status_changed` callback already reacting to it. Unlike a route called from outside, there's no separate caller to authenticate, because there's no separate caller at all.

## Guard the whole callback, not just the API call

The `try`/`catch (\Throwable $e)` wraps building the Twilio client and sending the message together, not just the send. That's deliberate: a route only ever fails the one request it's answering, [isolated automatically](/api/routes/#failure-isolation) by Loopress, but a hook callback executes inline with whatever fired it. An uncaught error here, `twilio/sdk` not installed, a bad option value, would surface as a fatal error in the middle of the order-status transition itself, not just a failed SMS. Catching broadly and logging is what keeps this snippet's own failure from becoming WooCommerce's failure.

## What this opens up

The same shape covers any order-lifecycle notification a store currently sends by polling for a status instead of reacting to it directly, a refund issued, a subscription about to renew, a back-in-stock alert. If the event that should trigger this happens outside WordPress, a payment provider's own system updating an order WordPress only mirrors, that's when a route with a shared secret is still the right tool: there's no WordPress hook to attach to for an event WordPress didn't originate.
