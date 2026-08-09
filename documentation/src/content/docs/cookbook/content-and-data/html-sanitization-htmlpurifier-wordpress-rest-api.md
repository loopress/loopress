---
title: Sanitizing Untrusted HTML Before It Reaches the Database, in a WordPress Route
description: A Custom API Route that cleans HTML pushed in from an external system with HTML Purifier before storing it as post content, a stricter option than wp_kses for content that didn't come through the block editor.
kind: route
draft: true
---

An external system, a contractor's CMS being migrated away from, a partner's content feed, pushes articles into WordPress as raw HTML through a route, not through the block editor. That HTML didn't go through any of the sanitization a logged-in editor typing in `wp-admin` implicitly gets, and it shouldn't be trusted the same way: a `<script>` tag, a `javascript:` link, an unclosed tag that breaks the page layout, all of that is now something this route has to actively guard against rather than assume away.

## Why this needs a package, and why not just `wp_kses_post()`

`wp_kses_post()` is WordPress's own HTML sanitizer, an allowlist of tags and attributes it strips anything else from, and it's the right default for content a trusted editor typed. It's an allowlist filter, not a full HTML parser: it doesn't fix malformed markup, doesn't normalize entities, and its rule set is tuned for what the block editor tends to produce, not for arbitrary HTML from an unknown source. [HTML Purifier](https://packagist.org/packages/ezyang/htmlpurifier) (`ezyang/htmlpurifier`) is a different kind of tool, a standards-compliant HTML parser and filter that rebuilds the document from a well-defined grammar, which is a stronger guarantee when the input is less predictable than "whatever the block editor's own JavaScript generated."

## The route

```php title="api/import-article.php"
<?php

declare(strict_types=1);

class ImportArticle
{
    public function post(WP_REST_Request $request): array|WP_Error
    {
        $title = sanitize_text_field((string) $request->get_param('title'));
        $html  = (string) $request->get_param('content');

        if ($title === '' || $html === '') {
            return new WP_Error('missing_fields', 'title and content are required.', ['status' => 400]);
        }

        $config = HTMLPurifier_Config::createDefault();
        $config->set('HTML.Allowed', 'p,a[href],strong,em,ul,ol,li,h2,h3,blockquote');
        $config->set('AutoFormat.RemoveEmpty', true);

        $clean = (new HTMLPurifier($config))->purify($html);

        $postId = wp_insert_post([
            'post_type'    => 'post',
            'post_status'  => 'draft',
            'post_title'   => $title,
            'post_content' => $clean,
        ]);

        return ['id' => $postId];
    }

    public function permission(WP_REST_Request $request): bool
    {
        return hash_equals((string) get_option('import_api_secret'), (string) $request->get_header('x-import-secret'));
    }
}
```

No `use` statement above `HTMLPurifier` or `HTMLPurifier_Config`: unlike every other package in this series, HTML Purifier predates PHP namespaces and ships classes in the global namespace with underscore-separated names, which its Composer package still declares an autoload map for. A route file has no `namespace` declaration of its own either, so these classes are already reachable without an import, the same as any other global-namespace class.

```bash
composer require ezyang/htmlpurifier
lps composer push
```

## Now call it

```bash
curl -X POST https://your-site.com/wp-json/loopress-api/v1/import-article \
  -H "x-import-secret: <secret>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Partner Feed Article","content":"<p onclick=\"alert(1)\">Hello <script>bad()</script>world</p>"}'
```

```json
{"id": 4821}
```

## Permission

Nothing about this route is meant for a browser: it's an import endpoint another system calls, protected the same way [the sitemap data route](/cookbook/content-and-data/headless-sitemap-generation-wordpress-rest-api/) earlier in this series is, a shared secret checked with `hash_equals()` rather than a logged-in user.

## A missing package fails the one request, not the site

Without `ezyang/htmlpurifier` installed, `HTMLPurifier` is an undefined class, an ordinary PHP error on this one request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

Anywhere WordPress accepts markup from a source it didn't fully control, a form builder's rich text field, a partner feed, an old CMS export, benefits from a real parser instead of an allowlist filter alone. It's also a narrow enough file, one config, one purify call, one insert, that it's a reasonable one to have an AI coding assistant draft, with the allowed-tags list being exactly the kind of decision worth setting deliberately rather than trusting a first pass on.
