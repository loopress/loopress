---
title: Composer Packages Are Available Inside Every Custom API Route
description: How Loopress's two Full-only features connect. Any package installed through Composer dependency management is available to `use` inside a Custom API Route, autoloaded automatically, no wiring required.
date: 2026-08-03
draft: false
cliVersion: 0.20.1
wordpressPluginVersion: 2026.7.16
authors:
  - maxime
tags:
  - composer
  - rest api
  - wordpress
  - php
excerpt: Composer dependency management and Custom API Routes were built as two separate Loopress Full features. They were also built to fit together. Here's the mechanism connecting them, and what it opens up.
---

Two Loopress Full features, each useful on their own: [Composer dependency management](/blog/wordpress-composer-without-ssh/) installs any Packagist package straight from the WordPress admin, and [Custom API Routes](/blog/custom-wordpress-endpoint-without-writing-a-plugin/) turn a version-controlled PHP file into a live REST endpoint. They were built separately, but not independently: a route file can `use` any package Composer installed, no extra step in between.

## Why reach for a package at all

`WP_Query` (or `get_posts()`) already covers anything the site itself holds: posts, pages, meta, taxonomies. A Composer package earns its place in a route the moment a request needs something WordPress doesn't have on its own: a currency rate from another service, a PDF built for a download link, a CSV parsed from an upload, a payload checked against a validation library before it touches the database. Once a route file can `use` a package, all of that is ordinary PHP, not a special case.

## The line you don't have to write

Using a Composer package anywhere else in WordPress, a snippet, `functions.php`, means loading the autoloader yourself first:

```php
require_once WP_CONTENT_DIR . '/loopress/vendor/autoload.php';

use GuzzleHttp\Client;
```

That line has to be there, in every file that touches a package, every time. Miss it and you get a fatal "Class not found" the moment the file runs.

## In a route file, it's not there

A Custom API Route already goes through Loopress's own loader before your code executes. That loader resolves the same `wp-content/loopress/vendor/` autoloader `lps composer push` fills, once, before your route class is even loaded, so a route file just uses a package like normal PHP:

```php
<?php

declare(strict_types=1);

use GuzzleHttp\Client;

class Webhook
{
    public function post(): array
    {
        $client = new Client();
        // ...
        return ['ok' => true];
    }
}
```

No `require_once`, no path to get wrong, no difference between this and any Composer project you've worked on. The full reference is in [Writing Route Files](/api/routes/#using-your-own-composer-dependencies).

## Same safety net as everywhere else

A package that fails to load, missing from `vendor/`, a corrupted autoloader, doesn't take the route down with it. It's [logged and skipped](/api/routes/#failure-isolation) exactly like a broken route file: that one endpoint stops responding, everything else on the site keeps working. Composer dependencies inside a route get the same failure isolation as the route file itself, not a separate, weaker guarantee.

## What this opens up

Once the autoloader is a non-issue, the interesting question stops being "can I use a package here" and becomes "what's worth building with one." A route enriching WordPress content with a live external rate. One generating a file on demand instead of storing it. One validating a webhook payload before it's trusted. Each of those deserves its own walkthrough with real code and a real deploy, not a paragraph here, so that's what the rest of this series is for.

---

Both features ship with Loopress Full, free:

```bash
npm install -g @loopress/cli
```

[Composer dependency management](/composer/) covers installing and auditing packages from the admin. [Writing Route Files](/api/routes/) covers everything a route can do beyond this: authentication, CORS, the security model.
