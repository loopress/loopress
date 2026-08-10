---
title: Sending a WordPress Form Submission Straight into HubSpot
description: A Custom API Route that creates a HubSpot contact the moment a headless frontend's own contact form is submitted, using HubSpot's official PHP client, the kind of submission HubSpot's WordPress plugin never sees.
kind: route
draft: true
---

A headless frontend has its own contact form, built and rendered outside WordPress entirely, collecting a name, email, and a message, then posting wherever the frontend is told to post. HubSpot's own free WordPress plugin already bridges "WordPress form" to "HubSpot contact", but it does that by injecting its tracking script through `wp_footer` and rendering its forms (native or through a connected form builder) into a WordPress page. None of that exists on a headless site: there's no theme to inject a footer script into, no WordPress-rendered page for a HubSpot form to sit on. The plugin was never going to see this submission. The usual fallback, an email notification to a shared inbox, works until the inbox gets busy, a submission sits unread for two days, and by the time anyone follows up, the lead has already talked to a competitor. Sales teams live in a CRM, not an inbox.

## Why this needs a package

Creating a HubSpot contact through its REST API means authenticating, building the right request shape, and handling HubSpot's own error responses, a duplicate email conflicting with an existing contact, a malformed property, all of which [HubSpot's official PHP client](https://packagist.org/packages/hubspot/api-client) (`hubspot/api-client`) already implements and keeps in sync with HubSpot's API itself, rather than a route hand-building HTTP requests against endpoints that can change shape between API versions.

## The route

```php title="api/contact-form.php"
<?php

declare(strict_types=1);

use HubSpot\Client\Crm\Contacts\ApiException;
use HubSpot\Client\Crm\Contacts\Model\SimplePublicObjectInput;
use HubSpot\Factory;

class ContactForm
{
    public function post(WP_REST_Request $request): array|WP_Error
    {
        $email = sanitize_email((string) $request->get_param('email'));
        $name  = sanitize_text_field((string) $request->get_param('name'));

        if (!is_email($email)) {
            return new WP_Error('invalid_email', 'A valid email is required.', ['status' => 400]);
        }

        $hubspot = Factory::createWithAccessToken((string) get_option('hubspot_access_token'));

        $contact = new SimplePublicObjectInput();
        $contact->setProperties([
            'email'     => $email,
            'firstname' => $name,
        ]);

        try {
            $hubspot->crm()->contacts()->basicApi()->create($contact);
        } catch (ApiException $e) {
            // A 409 here almost always means this email already exists as a contact,
            // not a real failure, the lead reached out again, which is fine.
            if ($e->getCode() !== 409) {
                return new WP_Error('hubspot_error', 'Could not reach the CRM.', ['status' => 502]);
            }
        }

        return ['submitted' => true];
    }

    public function permission(): bool
    {
        return true;
    }
}
```

```bash
composer require hubspot/api-client
lps composer push
```

## Now call it

```bash
curl -X POST https://your-site.com/wp-json/loopress-api/v1/contact-form \
  -H "Content-Type: application/json" \
  -d '{"email":"lead@example.com","name":"Jamie Rivera"}'
```

```json
{"submitted": true}
```

## Permission

A contact form is meant to be public, so this stays open the same way [the featured products route](/blog/custom-wordpress-endpoint-without-writing-a-plugin/) earlier in this series is, deliberately, with `permission()` returning `true`. That does mean anyone can call it, repeatedly, each call spending a real HubSpot API request, so a route like this in production needs abuse protection, a honeypot field, a rate limit, something a real contact form needs regardless of what's behind it, not shown here to keep the CRM logic the focus.

## A missing package fails the one request, not the site

Without `hubspot/api-client` installed, `Factory` is an undefined class, an ordinary PHP error scoped to this request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

The same client handles updating a deal stage, logging an activity, anything else the CRM side of a sales process needs, all from whatever WordPress already knows happened. It's also a narrow, single-purpose file, one validation, one API call, one conflict case handled, that's a reasonable one to have an AI coding assistant draft, the 409-as-not-really-an-error branch being exactly the kind of detail worth checking against HubSpot's actual response before trusting a first pass on.
