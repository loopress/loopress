---
title: Ship a Custom WordPress Endpoint Without Writing a Plugin
description: Custom API Routes turn a version-controlled PHP file into a live WordPress REST endpoint. Write a class, push it, call it. No plugin boilerplate.
date: 2026-07-26
draft: false
cliVersion: 0.19.0
wordpressPluginVersion: 2026.7.15
authors:
  - maxime
tags:
  - rest api
  - wordpress
  - git
excerpt: Every WordPress project eventually needs a custom REST endpoint, a data feed for a frontend, a webhook receiver, an integration hook. Loopress Full now lets you ship one as a single PHP file in Git.
---

Your JavaScript frontend needs a list of featured products from WordPress. Not the whole REST API surface, not raw post objects with forty fields, just the ten items the homepage carousel shows, shaped the way the frontend wants them.

The endpoint is ten minutes of work: query, map, return. The question that eats the rest of the afternoon: where does that code go?

## Where custom endpoints live today

**`functions.php`.** Fastest to write, tied to your theme. Switch themes, lose the endpoint. Two years later it's line 1400 of a file nobody wants to scroll.

**A site-specific plugin.** The clean classic answer. But now your ten minutes of logic come wrapped in a plugin header, a hook, and a registration array:

```php
add_action('rest_api_init', function () {
    register_rest_route('acme/v1', '/featured-products', [
        'methods'             => 'GET',
        'callback'            => 'acme_featured_products',
        'permission_callback' => '__return_true',
    ]);
});
```

And you still need a way to get that plugin onto the site. And onto staging. And to know which version runs where.

**A snippets plugin.** Deployed in seconds, versioned never. The code lives in the database, edited through an admin textarea, invisible to Git and code review.

The endpoint logic is never the problem. The delivery vehicle is.

## One file, one route

With [Loopress Full](https://docs.loopress.dev/wordpress-plugin/) installed, a custom endpoint is a single PHP file in your repo:

```php
<?php

declare(strict_types=1);

class FeaturedProducts
{
    public function get(): array
    {
        $query = new WP_Query([
            'post_type'      => 'product',
            'meta_key'       => 'featured',
            'meta_value'     => '1',
            'posts_per_page' => 10,
        ]);

        return array_map(fn(WP_Post $post): array => [
            'id'    => $post->ID,
            'title' => $post->post_title,
            'url'   => get_permalink($post),
        ], $query->posts);
    }
}
```

Save it as `api/featured-products.php` and deploy:

```bash
lps api push
```

The conventions do all the wiring you saw above. The filename is the route. Each file declares exactly one class, named however you like (`FeaturedProducts` here, but `Handler` or anything else works the same), and each public method named after an HTTP verb (`get`, `post`, `put`, `patch`, `delete`) becomes that verb's handler. No registration code, no plugin header, no hook.

## Now call it

```bash
curl https://your-site.com/wp-json/loopress-api/v1/featured-products
```

```json
{"code":"rest_forbidden","message":"Sorry, you are not allowed to do that.","data":{"status":401}}
```

That 401 is the feature. A fresh route requires an administrator, the same authentication the Loopress CLI itself uses. Nothing you push is publicly reachable by accident.

For an endpoint another system calls on your behalf, a reporting script, an internal dashboard, a cron job, that default is already the right answer: the caller authenticates with an [application password](https://docs.loopress.dev/application-passwords/) over Basic auth, and you have a protected endpoint without writing a single line of security code.

This feed, though, is meant for the browser. Making it public is a decision, so it's expressed where decisions belong, in the file, in the diff, in code review:

```php
public function permission(WP_REST_Request $request): bool
{
    return true;
}
```

```bash
curl https://your-site.com/wp-json/loopress-api/v1/featured-products
```

```json
[{"id":231,"title":"Weekender Backpack","url":"https://your-site.com/product/weekender-backpack"}]
```

One greppable line. A reviewer seeing this diff knows exactly what's being opened to the world, which is not something you can say about a checkbox in an admin screen. The same `permission()` method receives the request directly, so routes that need their own rules, logged-in users only, a capability check, a signed webhook, express them the same way (the [docs](https://docs.loopress.dev/api/routes/) cover those patterns).

The frontend lives on another domain? Declare CORS headers in the file too, they apply to every request, preflight included:

```php
public function headers(): array
{
    return ['Access-Control-Allow-Origin' => 'https://app.example.com'];
}
```

Need an HTTP client or an SDK in a route? If the site uses [Loopress's Composer integration](https://docs.loopress.dev/composer/), your packages are directly available to `use` in route files. No manual autoloader loading.

## Built to not break your site

Deployed code that runs inside WordPress has one non-negotiable requirement: a mistake must stay contained.

- `lps api push` syntax-checks every file server-side and rejects broken PHP with the actual parse error, before anything is written.
- A file that still fails at runtime (a class collision with another plugin, a throwing dependency) is skipped and logged. Every other route, and the rest of the site's REST API, keeps working.
- Files are protected from direct HTTP access and written atomically. Pull them back and you get exactly the source you wrote.

## Endpoints your repository declares

Because routes are plain files, everything you already do with code applies:

```bash
lps api pull                  # mirror what's on the site locally
git checkout -b add-feed      # branch, edit, review
lps api push                  # deploy
```

Different environments? Push the same files to staging first, then production, like the rest of your Loopress-managed configuration. Endpoints stop being something you set up on a site and become something your repository declares.

---

Custom API Routes ship with Loopress Full, the free full edition of the plugin:

```bash
npm install -g @loopress/cli
```

The [documentation](https://docs.loopress.dev/api/) covers the complete file reference: request handling, response types, authentication, CORS, namespaces, and the security model.
