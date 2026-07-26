---
title: One PHP File, One REST Endpoint
description: Custom API Routes turn a version-controlled PHP file into a live WordPress REST endpoint. Write a class, push it, call it. No plugin boilerplate.
date: 2026-07-26
draft: false
authors:
  - maxime
tags:
  - rest api
  - wordpress
  - git
excerpt: Every WordPress project eventually needs a custom REST endpoint, a webhook receiver, a data feed for a frontend, an integration hook. Loopress Full now lets you ship one as a single PHP file in Git.
---

Every WordPress project eventually needs a custom REST endpoint. A webhook receiver for a payment provider. A JSON feed for a headless frontend. A small integration hook another system calls.

And every time, the same question: where does this code live?

## The usual answers, and why they age badly

**`functions.php`.** It works, until the theme changes or the file becomes a dumping ground. Your endpoint's lifecycle is now tied to your design layer.

**A site-specific plugin.** The cleanest classic answer, but now you're maintaining plugin boilerplate, headers, activation hooks, and a deployment story for what is often thirty lines of actual logic.

**A code snippet plugin.** Quick, but your endpoint lives in the database, edited through an admin textarea, with no Git history and no code review.

In all three cases, the actual interesting part, your endpoint logic, is buried in scaffolding.

## The Loopress answer: one file, one route

With [Loopress Full](https://docs.loopress.dev/wordpress-plugin/) installed, a custom endpoint is a single PHP file in your repo:

```php
<?php

declare(strict_types=1);

class OrderWebhook
{
    public function post(WP_REST_Request $request): array
    {
        $payload = $request->get_json_params();
        // your logic here
        return ['received' => true];
    }
}
```

Save it as `api/order-webhook.php` and deploy:

```bash
lps api push
```

The endpoint is live:

```
POST https://your-site.com/wp-json/loopress-api/v1/order-webhook
```

The conventions do the wiring. The filename is the route. The class name is the filename in PascalCase. Each public method named after an HTTP verb (`get`, `post`, `put`, `patch`, `delete`) becomes that verb's handler. There is no registration code, no `add_action('rest_api_init', ...)`, no plugin header.

## Locked by default, open by choice

A fresh route requires an administrator, the same authentication the Loopress CLI itself uses. Nothing is publicly reachable by accident.

When a route should be open, or use its own rules, you say so in the file:

```php
public function permission(): callable
{
    return fn(WP_REST_Request $request): bool =>
        hash_equals((string) get_option('webhook_secret'), (string) $request->get_header('x-webhook-secret'));
}
```

Calling it from a browser app on another domain? Declare your CORS headers in the file too, and they apply to every request, preflight included:

```php
public function headers(): array
{
    return ['Access-Control-Allow-Origin' => 'https://app.example.com'];
}
```

Need an HTTP client or a payment SDK? If the site uses [Loopress's Composer integration](https://docs.loopress.dev/composer/), your packages are directly available to `use` in route files. No manual autoloader loading.

## Built to not break your site

Deployed code that runs inside WordPress has one non-negotiable requirement: a mistake must stay contained.

- `lps api push` syntax-checks every file server-side and rejects broken PHP with the actual parse error, before anything is written.
- A file that still fails at runtime (a class collision with another plugin, a throwing dependency) is skipped and logged. Every other route, and the rest of the site's REST API, keeps working.
- Files are protected from direct HTTP access and written atomically. Pull them back and you get exactly the source you wrote.

## Fits the workflow you already have

Because routes are plain files, everything you already do with code applies:

```bash
lps api pull                  # mirror what's on the site locally
git checkout -b add-webhook   # branch, edit, review
lps api push                  # deploy
```

Different environments? Push the same files to staging first, then production, like the rest of your Loopress-managed configuration. Endpoints stop being something you set up on a site and become something your repository declares.

---

Custom API Routes ship with Loopress Full, the free full edition of the plugin. The [documentation](https://docs.loopress.dev/api/) covers the complete file reference: request handling, response types, authentication, CORS, namespaces, and the security model.
