---
title: Serving WordPress Posts as Markdown for LLMs with league/html-to-markdown
description: A Custom API Route that returns any published post as clean Markdown, using league/html-to-markdown, for AI assistants, llms.txt indexes and RAG pipelines that read text, not themed HTML.
kind: route
draft: true
---

An AI assistant, a documentation chatbot or a retrieval pipeline wants a site's content as text. Pointing it at the public page means it downloads the theme, the navigation, the cookie banner and the footer along with the article, then has to guess which part is the article. The core REST API is closer, but `content.rendered` is still HTML full of block markup, classes and inline styles, which costs tokens and carries nothing an LLM can use. The [`llms.txt`](https://llmstxt.org/) convention makes the expectation explicit: link to a Markdown version of each page. A route can produce that version from the post itself.

## Why this needs a package

Converting HTML to Markdown correctly is more than stripping tags: headings become `#` lines, links keep their target, lists keep their nesting, `<pre><code>` becomes a fenced block, and everything Markdown has no equivalent for has to be dropped without losing its text. [`league/html-to-markdown`](https://packagist.org/packages/league/html-to-markdown) does exactly that conversion, on top of PHP's own DOM parser.

## The route

```php title="api/markdown/[post_id].php"
<?php

declare(strict_types=1);

use League\HTMLToMarkdown\HtmlConverter;
use Loopress\Api\Attribute\Permission;

#[Permission(public: true)]
class PostMarkdown
{
    public function get(WP_REST_Request $request): WP_Error
    {
        $post = get_post((int) $request->get_param('post_id'));

        if ($post === null || $post->post_status !== 'publish' || post_password_required($post)) {
            return new WP_Error('not_found', 'No published post with that id.', ['status' => 404]);
        }

        $html = apply_filters('the_content', $post->post_content);

        $converter = new HtmlConverter([
            'strip_tags'   => true,
            'header_style' => 'atx',
        ]);

        // Raw Markdown, not JSON: set the header, send the body, stop.
        header('Content-Type: text/markdown; charset=utf-8');
        echo '# ' . get_the_title($post) . "\n\n" . $converter->convert($html) . "\n";
        exit;
    }
}
```

```bash
composer require league/html-to-markdown
lps composer push
```

`apply_filters('the_content', ...)` renders the post exactly as the theme would, blocks, shortcodes and embeds included, so the Markdown matches what a visitor actually reads, not the raw block comments stored in the database. `strip_tags` drops the markup Markdown can't express (a `<figure>` wrapper, a `<div>`) but keeps its text, and `header_style: atx` writes `## Heading` instead of the underlined style, which is what most LLM tooling expects.

## Now call it

```bash
curl https://your-site.com/wp-json/loopress-api/v1/markdown/489
```

````markdown
# Shipping notes

## Why

Read the [docs](https://loopress.dev), *then* ship.

- Git
- CI

```
lps api push
```
````

That's a real Gutenberg post (heading, paragraph, list and code blocks), converted. A draft, a private post or a password-protected one answers `404` instead.

## Permission

The route is public on purpose: an AI crawler or an assistant fetching a page has no WordPress account. It only ever returns what's already public, published posts without a password, the same text the site shows any visitor. The `post_status` and `post_password_required()` checks are what make that true, don't remove them to "also support drafts": a draft served here would be readable by anyone who guesses its id. For drafts, see [signed draft previews](/cookbook/auth-and-security/headless-draft-preview-php-jwt-wordpress-rest-api/).

## A missing package is scoped to this route

Without `league/html-to-markdown` installed, `HtmlConverter` is an undefined class, an ordinary PHP error on this one request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

With one Markdown URL per post, an `llms.txt` index is a second small route listing them. The same conversion feeds a RAG pipeline's ingestion step, a newsletter tool that wants Markdown, or a migration away from WordPress entirely. It's the reverse of [rendering Markdown with CommonMark](/cookbook/content-and-data/markdown-rendering-commonmark-wordpress-rest-api/), which turns Markdown written elsewhere into HTML for WordPress.
