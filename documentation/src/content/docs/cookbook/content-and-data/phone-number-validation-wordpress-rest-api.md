---
title: Validating and Formatting Phone Numbers in a WordPress Route
description: A Custom API Route that checks a phone number is real and reformats it to E.164 before it's saved, using giggsey/libphonenumber-for-php, the PHP port of Google's own library.
kind: route
draft: true
---

A checkout form collects a phone number for SMS order updates. `sanitize_text_field()` strips tags and control characters, which is the right sanitization for storing any text field safely, but it has no idea whether `"555-12"` or `"+1 (555) not-a-number"` is a real, dialable phone number, that's a different problem, and it's a global one: a number valid in France has a different length and format than one valid in Brazil, and a naive regex checking "looks like digits" accepts plenty of strings that will fail the moment an SMS provider actually tries to send to them.

## Why this needs a package

Real phone number validation, is this number possible for this region, is it actually assigned to a type of line, what's its canonical international format, is metadata-driven: it depends on a large, regularly updated table of country codes, number lengths, and formatting rules that changes as carriers and countries change their numbering plans. [`giggsey/libphonenumber-for-php`](https://packagist.org/packages/giggsey/libphonenumber-for-php) is a PHP port of Google's own `libphonenumber`, the same library behind Android's phone number handling, kept in sync with the same metadata.

## The route

```php title="api/validate-phone.php"
<?php

declare(strict_types=1);

use libphonenumber\NumberParseException;
use libphonenumber\PhoneNumberFormat;
use libphonenumber\PhoneNumberUtil;

class ValidatePhone
{
    public function post(WP_REST_Request $request): array
    {
        $raw     = (string) $request->get_param('phone');
        $country = (string) ($request->get_param('country') ?: 'US');

        $phoneUtil = PhoneNumberUtil::getInstance();

        try {
            $parsed = $phoneUtil->parse($raw, $country);
        } catch (NumberParseException $e) {
            return ['valid' => false, 'reason' => $e->getMessage()];
        }

        if (!$phoneUtil->isValidNumber($parsed)) {
            return ['valid' => false, 'reason' => 'not a valid number for that region'];
        }

        return [
            'valid'    => true,
            'e164'     => $phoneUtil->format($parsed, PhoneNumberFormat::E164),
            'national' => $phoneUtil->format($parsed, PhoneNumberFormat::NATIONAL),
        ];
    }

    public function permission(): bool
    {
        return true;
    }
}
```

```bash
composer require giggsey/libphonenumber-for-php
lps composer push
```

The `country` parameter matters more than it looks: `parse()` uses it to interpret a number typed without a country code, `"555 123 4567"` means something different depending on whether it's being read as a US number or a French one. A route calling this from a checkout form should pass whatever country the billing address already says, not assume one.

## Now call it

```bash
curl -X POST https://your-site.com/wp-json/loopress-api/v1/validate-phone \
  -H "Content-Type: application/json" \
  -d '{"phone":"555 123 4567","country":"US"}'
```

```json
{"valid": true, "e164": "+15551234567", "national": "(555) 123-4567"}
```

## Permission

Validating a phone number doesn't read or write anything sensitive on its own, so this stays public, the same way a client-side validation step would be. What calls it and what it does with the result, saving `e164` to an order rather than the raw input, is where the actual data-handling decisions live, and those happen in whatever route receives the checkout submission, not here.

## A missing package fails the one request, not the site

Without `giggsey/libphonenumber-for-php` installed, `PhoneNumberUtil` is an undefined class, an ordinary PHP error scoped to this request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

The same library's formatting output, E.164, is exactly the shape most SMS APIs require as input, so this route is naturally the first step before ever calling one. It's also a small, self-contained file, one parse call, one validity check, one format call, that's a reasonable one to have an AI coding assistant draft and check against a handful of real numbers before trusting it.
