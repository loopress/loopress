---
title: Rendering Markdown Content to HTML in a WordPress Route with CommonMark
description: A Custom API Route that converts stored Markdown into HTML on read, using league/commonmark, for content that reaches WordPress as Markdown rather than through the block editor.
kind: route
draft: true
---

A `changelog_entry` custom post type holds release notes, written as plain Markdown and populated by whatever process feeds it, a script pulling from a `CHANGELOG.md`, a migration from another system, anything that isn't the block editor. `post_content` ends up with real Markdown syntax in it, `**bold**`, `` `code` ``, fenced code blocks, and WordPress's own content pipeline has no idea what to do with that: `wpautop()` wraps blank-line-separated text in `<p>` tags, it doesn't parse Markdown syntax, so `**bold**` renders as the literal four characters, not bold text.

## Why this needs a package

Markdown parsing, headings, emphasis, lists, code fences, links, tables in the GitHub-flavored variant, is a full micro-syntax with a formal specification (CommonMark). [`league/commonmark`](https://packagist.org/packages/league/commonmark) is the standard PHP implementation of that spec, actively maintained, and it does exactly one job well: take a Markdown string, return HTML.

## The route

```php title="api/changelog.php"
<?php

declare(strict_types=1);

use League\CommonMark\CommonMarkConverter;

class Changelog
{
    public function get(): array
    {
        $entries = new WP_Query([
            'post_type'      => 'changelog_entry',
            'posts_per_page' => 20,
            'orderby'        => 'date',
            'order'          => 'DESC',
        ]);

        // See "Permission and a safer default config" below: html_input and
        // allow_unsafe_links both default to the permissive, spec-compliant behavior,
        // not the safe one.
        $converter = new CommonMarkConverter([
            'html_input'         => 'escape',
            'allow_unsafe_links' => false,
        ]);

        return array_map(static fn (WP_Post $post): array => [
            'id'    => $post->ID,
            'date'  => get_the_date('Y-m-d', $post),
            'title' => $post->post_title,
            'html'  => (string) $converter->convertToHtml($post->post_content),
        ], $entries->posts);
    }

    public function permission(): bool
    {
        return true;
    }
}
```

```bash
composer require league/commonmark
lps composer push
```

Rendering happens on every request rather than once at save time, which means the HTML output always reflects the current converter configuration, upgrading `league/commonmark` or changing an option takes effect on the next request, not on the next time every post happens to be re-saved. For twenty short changelog entries this costs nothing measurable; a much larger set of long documents would be a reason to cache the rendered HTML rather than reparse it every time, not a reason to change the approach.

## Now call it

```bash
curl https://your-site.com/wp-json/loopress-api/v1/changelog
```

```json
[{"id": 118, "date": "2026-08-01", "title": "1.4.0", "html": "<h2>Added</h2>\n<ul>\n<li>Bulk export to CSV</li>\n</ul>\n"}]
```

## Permission and a safer default config

This route is read-only public content, a changelog, so it stays open. The configuration passed to `CommonMarkConverter` matters more here than the `permission()` method does: CommonMark's [own security documentation](https://commonmark.thephpleague.com/2.x/security/) is explicit that both `html_input` (whether raw HTML inside the Markdown source passes through unchanged) and `allow_unsafe_links` (whether a `javascript:` link is allowed to render) default to the permissive, spec-compliant behavior, not the safe one, and that rendering Markdown from anyone other than a fully trusted source without overriding both is a real XSS risk. Whatever populates `changelog_entry` posts today might not be the only thing that ever does, the explicit config above is worth keeping even if the current source is trusted.

```php
public function permission(): bool
{
    return true;
}
```

## A missing package is scoped to this route

Without `league/commonmark` installed, `CommonMarkConverter` is an undefined class, an ordinary PHP error on this one request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

The same converter handles any Markdown-sourced content, imported documentation, release notes, anything where the source of truth is a `.md` file somewhere and WordPress is just the delivery mechanism for it. It's also a small, single-purpose file, one query, one conversion call, that's a reasonable one to hand an AI coding assistant to draft, with the security configuration above being exactly the kind of line worth checking by hand rather than trusting a first pass on.
