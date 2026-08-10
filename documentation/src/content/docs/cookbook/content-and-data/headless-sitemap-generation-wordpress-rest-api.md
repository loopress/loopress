---
title: Building a Sitemap for a Headless WordPress Frontend
description: A Custom API Route that hands a headless frontend's own build process the sitemap data it needs, using icamys/php-sitemap-generator, since an SEO plugin's sitemap points at the wrong domain once WordPress stops rendering pages.
kind: route
draft: true
---

A headless WordPress site has a Next.js or Astro frontend on `www.example.com`, with WordPress itself living on a separate, often unpublicized origin like `cms.example.com`. Yoast (or Rank Math, or WordPress core's own `/wp-sitemap.xml`) still generates a perfectly valid sitemap, it's just full of `cms.example.com` URLs, because that's the only domain WordPress knows about. Submit that to Search Console and every URL either 404s for a visitor or gets flagged as not matching the site being verified. This is a well-documented headless WordPress complaint, not a one-off configuration mistake, search engine plugins were built assuming WordPress renders the page a visitor actually lands on, and a headless setup breaks that assumption at the root.

## Why this needs a package, and a different approach

The usual workarounds, rewriting URLs in the existing sitemap output or redirecting the WordPress-origin sitemap to the frontend, are patches on a plugin that was never generating the sitemap for the domain that needed it. A cleaner fix: let the frontend's own build or deploy process ask WordPress for the sitemap data directly, at the one domain that's actually correct, the frontend's own. The XML sitemap format itself has real structure, a 50,000 URL cap per file, an index file once you exceed it, specific date formatting, that's worth a maintained implementation rather than string-concatenating `<url>` tags by hand. [`icamys/php-sitemap-generator`](https://packagist.org/packages/icamys/php-sitemap-generator) handles that part.

## The route

```php title="api/sitemap-data.php"
<?php

declare(strict_types=1);

use Icamys\SitemapGenerator\Config;
use Icamys\SitemapGenerator\SitemapGenerator;

class SitemapData
{
    public function get(WP_REST_Request $request): array
    {
        $baseUrl = (string) get_option('headless_frontend_url'); // e.g. https://www.example.com

        $config = new Config();
        $config->setBaseURL($baseUrl);
        $config->setSaveDirectory(sys_get_temp_dir());

        $generator = new SitemapGenerator($config);
        $generator->setSitemapFileName('headless-sitemap.xml');

        $posts = new WP_Query(['post_type' => 'post', 'post_status' => 'publish', 'posts_per_page' => -1]);
        foreach ($posts->posts as $post) {
            $path = wp_make_link_relative(get_permalink($post));
            $generator->addURL($path, get_post_modified_time('c', true, $post), 'weekly', 0.8);
        }

        $generator->flush();
        $generator->finalize();

        $filePath = rtrim(sys_get_temp_dir(), '/') . '/headless-sitemap.xml';
        $xml      = file_get_contents($filePath);
        unlink($filePath);

        return ['xml' => $xml];
    }
}
```

```bash
composer require icamys/php-sitemap-generator
lps composer push
```

The library writes to disk, there's no in-memory string output, so the route writes to the system's temp directory, reads the result back, and deletes it before responding, this is exactly the file-based mechanic the library actually has, not a hand-wave over it. The frontend's build step calls this route, takes `xml` from the JSON response, and writes it to its own `public/sitemap.xml`, at the one domain search engines are actually supposed to see.

## Now call it

```bash
curl https://your-site.com/wp-json/loopress-api/v1/sitemap-data \
  -H "x-build-secret: <secret>"
```

```json
{"xml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><urlset>...</urlset>"}
```

## Permission

Building this list means a full unfiltered `WP_Query` over every published post, expensive enough on a large site that it shouldn't be free to hit repeatedly, and it's meant for one specific caller, the frontend's own build process, not a browser or a search engine crawler:

```php
public function permission(WP_REST_Request $request): bool
{
    return hash_equals((string) get_option('sitemap_build_secret'), (string) $request->get_header('x-build-secret'));
}
```

## A missing package fails the one request, not the site

Without `icamys/php-sitemap-generator` installed, `SitemapGenerator` is an undefined class, an ordinary PHP error scoped to this request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

The same route can grow to cover pages, custom post types, product listings, anything that needs to end up in the frontend's sitemap, the query changes, the shape of what's returned doesn't. It's also a self-contained enough file, one query, one library call, one cleanup step, that it's a reasonable one to have an AI coding assistant draft, the temp-file cleanup being exactly the kind of line worth confirming is actually there rather than trusting a first pass on.
