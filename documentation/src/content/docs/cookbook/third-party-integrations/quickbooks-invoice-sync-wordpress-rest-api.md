---
title: Pushing a Completed WordPress Order into QuickBooks as an Invoice
description: A snippet that creates a QuickBooks invoice the moment an order completes, hooked directly to WooCommerce, using Intuit's official PHP SDK, instead of someone re-typing the week's orders into accounting software by hand.
kind: snippet
draft: true
---

A small business runs orders through a WordPress-based storefront and books through QuickBooks, and nothing connects the two. Someone, often whoever's doing the books, ends up manually re-entering each completed order as an invoice, line items, amounts, customer name, copied by hand from one system into the other. It works, it's also exactly the kind of repetitive, error-prone task that's a rounding error to automate once the order data already exists in WordPress as structured data, not something worth re-typing from a screen.

## Why this needs a package

QuickBooks Online's API is OAuth2-authenticated and expects invoices as a fairly specific nested object, line items, item references, customer references, each with their own required shape. [Intuit's official PHP SDK](https://packagist.org/packages/quickbooks/v3-php-sdk) (`quickbooks/v3-php-sdk`) provides a facade for building that object from a plain array instead of hand-constructing the exact JSON shape QuickBooks expects.

## Authentication, briefly

Like most real accounting and CRM APIs, QuickBooks uses OAuth2 with a refresh token, not a static key, `DataService::Configure()` below takes an access token that's assumed already valid, refreshed on its own schedule by a separate process. That refresh cycle is real infrastructure worth building deliberately, not something to gloss over inside the one file whose actual job is creating an invoice.

## The snippet

An order completing is already a WordPress-native event, WooCommerce fires it directly. A [snippet](/snippets/) hooked to `woocommerce_order_status_changed` creates the invoice the moment that happens, instead of a route waiting for something else to call it:

```php title="snippets/sync-quickbooks-invoice.php"
require_once WP_CONTENT_DIR . '/loopress/vendor/autoload.php';

use QuickBooksOnline\API\DataService\DataService;
use QuickBooksOnline\API\Facades\Invoice;

add_action('woocommerce_order_status_changed', function (int $orderId, string $from, string $to): void {
    if ($to !== 'completed') {
        return;
    }

    $total = get_post_meta($orderId, '_order_total', true);
    if (!is_numeric($total)) {
        return;
    }

    try {
        $dataService = DataService::Configure([
            'auth_mode'       => 'oauth2',
            'ClientID'        => (string) get_option('quickbooks_client_id'),
            'ClientSecret'    => (string) get_option('quickbooks_client_secret'),
            'accessTokenKey'  => (string) get_option('quickbooks_access_token'),
            'refreshTokenKey' => (string) get_option('quickbooks_refresh_token'),
            'QBORealmID'      => (string) get_option('quickbooks_realm_id'),
            'baseUrl'         => 'Production',
        ]);

        // TODO: verify the exact Line/SalesItemLineDetail structure and required
        // CustomerRef shape against quickbooks/v3-php-sdk's current docs, this is a
        // best-effort reconstruction of the Facade's expected array, not confirmed against
        // a live copy of the current SDK.
        $invoice = Invoice::create([
            'DocNumber' => (string) $orderId,
            'Line'      => [[
                'Amount'         => (float) $total,
                'DetailType'     => 'SalesItemLineDetail',
                'SalesItemLineDetail' => [
                    'ItemRef' => ['value' => (string) get_option('quickbooks_default_item_id')],
                ],
            ]],
            'CustomerRef' => ['value' => (string) get_post_meta($orderId, '_quickbooks_customer_id', true)],
        ]);

        $dataService->Add($invoice);
    } catch (\Throwable $e) {
        // Catches a missing quickbooks/v3-php-sdk install the same way it catches an
        // actual API failure, an uncaught error here would otherwise break WooCommerce's
        // own order-status transition, not just the invoice sync.
        error_log("QuickBooks sync failed for order {$orderId}: {$e->getMessage()}");
    }
}, 10, 3);
```

```bash
composer require quickbooks/v3-php-sdk
lps composer push
lps snippet push
```

## Nothing to gate, and why that's fine

There's no `permission()` here, `woocommerce_order_status_changed` only ever fires from inside WooCommerce's own order lifecycle, the same trust boundary as any other callback already reacting to it. There's no separate caller to authenticate because there's no separate caller at all.

## Guard the whole callback, not just the API call

The `try`/`catch (\Throwable $e)` wraps configuring the QuickBooks connection and building the invoice together, not just the final `Add()` call. A route only ever fails the one request it's answering, [isolated automatically](/api/routes/#failure-isolation) by Loopress, but a hook callback executes inline with whatever fired it. An uncaught error here, `quickbooks/v3-php-sdk` not installed, an expired token, would surface as a fatal error in the middle of WooCommerce's own order-status transition, not just a failed sync. Catching broadly and logging is what keeps this snippet's own failure from becoming WooCommerce's failure.

## What this opens up

The same SDK reads back payment status, updates a customer record, anything else where WordPress and the accounting system need to agree on the same facts. If the event that should trigger a sync happens outside WordPress, an external system pushing orders in that WordPress only mirrors, that's when a route is still the right tool: there's no WordPress hook to attach to for an event WordPress didn't originate.
