---
title: Verify Stripe Webhook Signatures in a WordPress REST Route
description: Receive Stripe webhooks in WordPress and verify the Stripe-Signature header with stripe-php's constructEvent in one Loopress API route. No account needed.
kind: route
---

A WordPress site takes payments through Stripe and needs to know when a checkout completes, so it can mark an order as paid or open access to content. Stripe's answer is a webhook: it POSTs an event to a URL you register, signed so you can trust it came from Stripe. The URL has to be public, so the signature is the only thing standing between your order statuses and anyone who guesses the address.

[Writing Route Files](/api/routes/#authentication-and-permissions) already shows the general shape for a webhook you designed yourself: a `permission()` that compares a shared secret against a header with `hash_equals()`. Stripe's scheme is more specific than a shared secret, and getting it wrong quietly is easy.

## Why this needs a package, not a comparison

Stripe signs each webhook with an HMAC-SHA256 over `{timestamp}.{raw body}`, sends the timestamp and signature together in a `Stripe-Signature` header (`t=...,v1=...`), and expects you to reject anything outside a tolerance window (five minutes by default) so a captured payload cannot be replayed later. Parsing the header, building the exact signed string from the raw body, comparing in constant time and checking the timestamp is what [`stripe/stripe-php`](https://packagist.org/packages/stripe/stripe-php), Stripe's own SDK, already implements. Re-deriving it by hand looks right with one sample payload and fails in production the first time Stripe adds a second `v1` value to the header.

## The route

```php title="api/stripe-webhook.php"
<?php

declare(strict_types=1);

use Stripe\Event;
use Stripe\Exception\SignatureVerificationException;
use Stripe\Webhook;

class StripeWebhook
{
    private ?Event $event = null;

    public function permission(WP_REST_Request $request): bool
    {
        $secret = defined('STRIPE_WEBHOOK_SECRET') ? (string) STRIPE_WEBHOOK_SECRET : (string) get_option('stripe_webhook_secret');

        // An empty secret would let anyone sign a payload with an empty key: refuse instead.
        if ($secret === '') {
            return false;
        }

        try {
            $this->event = Webhook::constructEvent($request->get_body(), (string) $request->get_header('stripe-signature'), $secret);
        } catch (\UnexpectedValueException | SignatureVerificationException) {
            return false;
        }

        return true;
    }

    public function post(): array
    {
        // permission() already ran on this same instance and verified the event.
        if ($this->event === null) {
            return ['ok' => false];
        }

        if ($this->event->type === 'checkout.session.completed') {
            $orderId = (int) ($this->event->data->object->metadata->order_id ?? 0);

            if ($orderId > 0 && get_post($orderId) !== null) {
                update_post_meta($orderId, '_payment_status', 'paid');
            }
        }

        return ['ok' => true, 'type' => $this->event->type];
    }
}
```

The project needs `stripe/stripe-php` and the route deployed:

```bash
composer require stripe/stripe-php
lps composer push
lps api push
```

The signing secret is a site secret, never committed. Either define `STRIPE_WEBHOOK_SECRET` in `wp-config.php`, or store it in an option:

```bash
wp option update stripe_webhook_secret whsec_...
```

Some details are worth knowing:

- `Webhook::constructEvent()` does the signature check and the JSON decode in one call and returns a typed `Event`. It reads the raw body from `$request->get_body()`: verifying a body that was decoded and re-encoded would never match.
- Storing the event on `$this->event` in `permission()` and reading it in `post()` works because both run on the same object within one request.
- The empty-secret check is not decoration. An HMAC with an empty key is perfectly computable, so without it a site that forgot to set the secret would accept payloads that anyone signed with an empty key.
- `post()` only writes when the order exists, so a test event (which carries no `order_id`) changes nothing.

## Now call it

Stripe's webhook sender is the only caller that can produce a signature the route accepts with your real secret, but you can sign a payload yourself with the same scheme and a test secret. With the option set to `whsec_test_secret`:

```bash
BODY='{"id":"evt_1","object":"event","type":"checkout.session.completed","data":{"object":{"metadata":{"order_id":"5"}}}}'
TS=$(date +%s)
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac whsec_test_secret | sed 's/.* //')

curl -X POST https://your-site.com/wp-json/loopress-api/v1/stripe-webhook \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=$TS,v1=$SIG" \
  -d "$BODY"
```

```json
{"ok":true,"type":"checkout.session.completed"}
```

Order 5 now has `_payment_status` set to `paid`. Each of these is refused with the standard `rest_forbidden` answer, and never reaches `post()`:

- a signature computed with another secret,
- the same signature with one character of the body changed,
- a correct signature whose timestamp is ten minutes old,
- no `Stripe-Signature` header,
- any request at all while no secret is configured.

```json
{"code": "rest_forbidden", "message": "Sorry, you are not allowed to do that.", "data": {"status": 401}}
```

To test with a real Stripe account instead, the [Stripe CLI](https://docs.stripe.com/stripe-cli/overview) forwards signed test events to your site:

```bash
stripe listen --forward-to https://your-site.com/wp-json/loopress-api/v1/stripe-webhook
# prints a whsec_... signing secret: store it as stripe_webhook_secret
stripe trigger checkout.session.completed
```

The secret `stripe listen` prints is not the one of the endpoint you register in the Stripe dashboard: each has its own, so swap it when you go live.

## Why this lives in `permission()`, not the verb method

An unsigned or forged request never reaches `post()`: it gets WordPress's standard `rest_forbidden` response, like any other failed permission check. It also inherits the [fail-closed guarantee](/api/routes/#authentication-and-permissions) of every `permission()`: if it throws instead of returning cleanly, the request is denied and the error is logged, the route keeps working for the next request.

## A missing package is scoped to this route

Without `stripe/stripe-php` installed, `Webhook::constructEvent()` is an undefined class. Loopress catches the error at dispatch, logs a `Loopress api/:` line and answers that request with a 500, the rest of the site and the other routes are unaffected (see [Failure isolation](/api/routes/#failure-isolation)). Push the package through [Composer dependency management](/composer/) before the route.

## What this opens up

The same shape covers any provider with an SDK that already verifies its own signatures: GitHub, Shopify, a payment provider other than Stripe. The file has a narrow contract, one `permission()` and one verb method, so a first draft from an AI coding assistant is something you can review line by line.
