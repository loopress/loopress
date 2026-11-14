---
title: Rendering a WordPress Post as a Downloadable PDF
description: A Custom API Route that turns any published post's rendered content into a PDF on request, using dompdf, for a "Download as PDF" button that doesn't need a plugin.
kind: route
youtubeId: N6z3KOsJpVE
---

A recipe site, a documentation page, a long-form guide, readers keep asking for a "Download as PDF" button so they can read it offline or print it without the theme's header, sidebar, and comment thread fighting for space on the same page. WordPress already renders a post as HTML on every request, turning that same content into a PDF instead of a webpage is a different rendering target, and it's one core has no opinion on.

## Why this needs a package

WordPress has no PDF renderer. The `the_content` filter gives you a post's fully rendered HTML, blocks resolved, shortcodes expanded, embeds processed, but turning HTML into a PDF byte stream is a separate problem. [dompdf](https://packagist.org/packages/dompdf/dompdf) (`dompdf/dompdf`) does exactly that: feed it HTML and CSS, it lays the page out and returns PDF bytes, no separate drawing API to learn on top of it. That matters here specifically: a post's content is already HTML the moment `the_content` runs it, not a document that has to be built field by field the way a library like TCPDF expects.

## The route

```php title="api/post-pdf/[post_id].php"
<?php

declare(strict_types=1);

use Dompdf\Dompdf;

final class PostPdf_PostId
{
    public function get(WP_REST_Request $request): void
    {
        $postId = (int) $request->get_param('post_id');
        $post   = get_post($postId);

        // Same answer for every post a visitor could not read on the site itself: missing,
        // draft, private, password-protected, or a post type with no public page.
        if ($postId < 1 || $post === null || ! is_post_publicly_viewable($post) || ! empty($post->post_password)) {
            wp_die(esc_html('No published post with that id.'), '', ['response' => 404]);
        }

        $dompdf = new Dompdf();
        $dompdf->loadHtml($this->postHtml($post));
        $dompdf->setPaper('A4');
        $dompdf->render();

        header('Content-Type: application/pdf');
        header('Content-Disposition: inline; filename="' . sanitize_title($post->post_title) . '.pdf"');
        header('Cache-Control: public, max-age=3600');
        echo $dompdf->output();
        exit;
    }

    private function postHtml(WP_Post $post): string
    {
        $title = esc_html($post->post_title);

        // Already-safe rendered HTML from WordPress's own content pipeline, not raw
        // post_content (unrendered block markup for a block-based post) and not run through
        // esc_html() here, that would mangle every tag instead of escaping untrusted text.
        $content = apply_filters('the_content', $post->post_content);

        return <<<HTML
            <html>
                <body style="font-family: sans-serif;">
                    <h1>{$title}</h1>
                    {$content}
                </body>
            </html>
            HTML;
    }

    public function permission(): bool
    {
        return true;
    }
}
```

```bash
composer require dompdf/dompdf
lps composer push
```

`the_content` is a filter, not a method on `$post`, calling it directly (rather than the global `the_content()` template tag, which echoes and depends on the loop being set up) is what makes this work outside a normal template context. Running it here means shortcodes, embeds, and any other plugin hooked into content rendering all still apply, the PDF shows the same content a visitor would actually see, not a raw, half-rendered block editor string.

## Now call it

```bash
curl https://your-site.com/wp-json/loopress-api/v1/post-pdf/482 \
  -o my-post.pdf
```

That writes an actual `my-post.pdf` to disk, `-o` instead of letting curl dump raw PDF bytes to the terminal. A browser hitting the same URL directly opens it inline instead, `Content-Disposition: inline` is what the route sends.

## Permission

A post a visitor can read on the site is as public as the PDF of it, so this route stays open. The guard in `get()` does double duty, it's the not-found guard, and it's what keeps a post the caller could not read from being exportable just because someone guesses its ID. A status check alone is not enough: a password-protected post has the `publish` status, and its body would end up in the PDF for anyone. `is_post_publicly_viewable()` refuses drafts, private posts and post types with no public page, a non-empty `post_password` refuses a protected post, whatever cookie the visitor sends, since the PDF is cached publicly, and all of them, plus an unknown or non-numeric ID, answer the same 404.

## If dompdf isn't installed

Without `dompdf/dompdf` installed, `Dompdf` is an undefined class, an ordinary PHP error scoped to this request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

The same shape covers any post type with a "download" or "print" need, documentation pages, recipe posts, long-form guides, a portfolio piece. It's also a narrow file, one lookup, one HTML template, one render call, that's a reasonable one to have an AI coding assistant draft, the choice of what to include in the printed layout, a featured image, an author byline, category tags, being exactly the kind of decision worth making deliberately rather than trusting a first pass on.
