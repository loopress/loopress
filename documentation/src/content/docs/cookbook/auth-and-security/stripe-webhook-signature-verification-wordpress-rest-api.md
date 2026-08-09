---
title: Verifying Stripe Webhooks in a WordPress REST Route with the Real SDK
description: A Custom API Route that receives Stripe webhooks and verifies them with stripe-php's own Webhook::constructEvent, instead of hand-rolling HMAC comparison.
kind: route
draft: true
---

A WordPress site takes payments through Stripe and needs to know when a checkout completes, a subscription renews, a payment fails, so it can update an order's status or gate access to content. Stripe's answer is a webhook: it POSTs an event to a URL you register, signed so you can trust it actually came from Stripe. [Writing Route Files](/api/routes/#authentication-and-permissions) already shows the general shape for a webhook receiver, a `permission()` that compares a shared secret against a header with `hash_equals()`. That pattern is correct for a webhook you designed yourself. Stripe's signing scheme is more specific than a single shared secret, and getting it wrong quietly is easy.

## Why this needs a package, not a comparison

Stripe signs each webhook with an HMAC-SHA256 over `{timestamp}.{raw body}`, sends the timestamp and signature together in a `Stripe-Signature` header, and expects you to reject anything outside a tolerance window (five minutes by default) to stop a captured payload from being replayed later. All of that, parsing the header's multiple values, building the exact signed string, comparing in constant time, checking the timestamp, is exactly what [`stripe/stripe-php`](https://packagist.org/packages/stripe/stripe-php), Stripe's own SDK, already implements and tests against their own webhook sender. Re-deriving it by hand in a route file is the kind of code that looks right, passes a manual test with one sample payload, and is subtly wrong in a way that only shows up as a rejected webhook in production three months later.

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
        $secret    = (string) get_option('stripe_webhook_secret');
        $sigHeader = (string) $request->get_header('stripe-signature');

        try {
            $this->event = Webhook::constructEvent($request->get_body(), $sigHeader, $secret);
        } catch (\UnexpectedValueException | SignatureVerificationException $e) {
            return false;
        }

        return true;
    }

    public function post(): array
    {
        // permission() already ran and populated $this->event: WordPress dispatches
        // permission_callback and callback on the same route instance within one request.
        if ($this->event === null) {
            return ['ok' => false];
        }

        if ($this->event->type === 'checkout.session.completed') {
            $session = $this->event->data->object;
            update_post_meta((int) $session->metadata->order_id, '_payment_status', 'paid');
        }

        return ['ok' => true];
    }
}
```

```bash
composer require stripe/stripe-php
lps composer push
```

`Webhook::constructEvent()` does double duty here: it's both the signature check and the JSON decode, returning a typed `Event` object instead of a raw array. Storing it on `$this->event` inside `permission()` and reading it back in `post()` isn't a workaround, it follows directly from how the route is dispatched: `permission()` and the verb method run against the same object instance within one request, so a property set in one is visible in the other.

## Now call it

This one isn't meant to be called by hand, Stripe's own webhook sender is the only caller that can produce a signature `permission()` accepts. The shape of what it sends still helps when reproducing an issue locally:

```bash
curl -X POST https://your-site.com/wp-json/loopress-api/v1/stripe-webhook \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=1754650000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd" \
  -d '{"id":"evt_1NG8DuKX8f","type":"checkout.session.completed","data":{"object":{"metadata":{"order_id":"482"}}}}'
```

```json
{"ok": true}
```

The signature above is illustrative, `constructEvent()` recomputes it from the raw body and the webhook secret and rejects anything that doesn't match, so this exact request only works against a secret it was actually signed with. Stripe's [webhook testing CLI](https://docs.stripe.com/stripe-cli/overview) is the practical way to generate a real one against a local site.

## Why this lives in `permission()`, not the verb method

Putting the check in `permission()` means an unsigned or forged request never reaches `post()` at all, it gets WordPress's standard `rest_forbidden` response, the same outcome as any other failed permission check. It also inherits the same [fail-closed guarantee](/api/routes/#authentication-and-permissions) every `permission()` gets: if it throws instead of returning cleanly, the request is denied and the error is logged, the route itself keeps working for the next request.

## A missing package, again, is scoped to this route

Without `stripe/stripe-php` installed, `Webhook::constructEvent()` is an undefined method on an undefined class, an ordinary PHP error on whichever request hits it first. Loopress doesn't catch that, only a corrupted or missing `vendor/autoload.php` itself is [caught and logged](/api/routes/#failure-isolation), before any route loads. Install the package through [Composer dependency management](/composer/) before pushing this route, and use the API secret from Stripe's own dashboard, not one you invented.

## What this opens up

The same shape covers GitHub webhooks, a payment provider other than Stripe, anything with a real SDK that already implements its own signature verification correctly. It's also a genuinely good fit for an AI coding assistant to draft: the file has a narrow, conventional contract, one `permission()`, one verb method, so a first-pass implementation is something you can actually review line by line instead of trusting blind.
