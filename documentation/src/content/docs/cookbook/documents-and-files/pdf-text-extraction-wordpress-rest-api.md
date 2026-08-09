---
title: Making Uploaded PDFs Searchable in WordPress with PdfParser
description: A snippet that pulls the text out of every uploaded PDF and saves it as searchable post meta the moment it lands in the media library, using smalot/pdfparser, so a resume or a spec sheet isn't just an opaque file.
kind: snippet
draft: true
---

A job board built on WordPress lets candidates upload a resume as part of an application. The PDF lands in the media library, attached to an `application` post, and that's the end of what WordPress knows about it: no way to search applications for "5 years React experience," no way to filter by a skill mentioned in the file, because the file's contents were never anything WordPress could see. The same problem shows up for spec sheets, product datasheets, any PDF a site accepts as an upload and then treats as an inert attachment rather than as data.

## Why this needs a package

A PDF isn't text with a `.pdf` extension, it's a page-description format, fonts, positioned glyphs, embedded structure, that happens to often contain extractable text, but getting that text out means actually parsing the format. [`smalot/pdfparser`](https://packagist.org/packages/smalot/pdfparser) does that: a pure-PHP PDF parser that reads the file's internal structure and returns the text it finds. It's worth noting upfront that the package is in limited maintenance, kept compatible with current PHP versions without active new feature work, which is a reasonable place for a focused parsing library to land and not a reason to avoid it, just worth knowing going in.

## The snippet

The upload itself already happens inside WordPress, a candidate uploading through the job board's own form, so nothing external needs to call anything afterward. A [snippet](/snippets/) hooked to `add_attachment` runs the instant WordPress finishes processing the file:

```php title="snippets/extract-pdf-text.php"
require_once WP_CONTENT_DIR . '/loopress/vendor/autoload.php';

use Smalot\PdfParser\Parser;

add_action('add_attachment', function (int $attachmentId): void {
    $path = get_attached_file($attachmentId);
    if ($path === false || strtolower(pathinfo($path, PATHINFO_EXTENSION)) !== 'pdf') {
        return;
    }

    try {
        $text = (new Parser())->parseFile($path)->getText();
    } catch (\Throwable $e) {
        // A password-protected or malformed PDF throws here, same as it would from a
        // route, worth telling apart from "this PDF genuinely has no text in it".
        return;
    }

    update_post_meta($attachmentId, '_extracted_text', wp_strip_all_tags($text));
});
```

```bash
composer require smalot/pdfparser
lps composer push
lps snippet push
```

Unlike a route, a snippet doesn't get the Composer autoloader for free, `require_once` at the top does that, the one manual step [Using dependencies in code snippets](/composer/using-in-snippets/) covers. `add_attachment` fires for every upload WordPress processes, this snippet filters down to PDFs, but the hook itself doesn't care what kind of file it is.

The extracted text is stripped and stored as post meta rather than kept anywhere else, once it's meta, it's searchable through a normal `meta_query`, or indexed into [a real search engine](/cookbook/search-and-data-services/instant-search-algolia-wordpress-rest-api/) the same as any other field, which is the actual point: turning an opaque attachment into something the rest of WordPress can query against.

## Nothing to gate, and why that's fine

There's no `permission()` here because there's nothing to call from outside, this code runs as WordPress itself, at the same trust level as any other `add_attachment` hook already firing on that upload, thumbnail generation included. The actual access control already happened one step earlier, whatever screen let this user upload an attachment in the first place.

## A missing package here fails quietly, not loudly

The `try`/`catch (\Throwable $e)` above catches an undefined `Parser` class the same way it catches a malformed PDF, PHP has turned a missing-class fatal into a catchable `Error` since PHP 7, so an uninstalled `smalot/pdfparser` just means no text gets extracted, not a broken upload screen. That's not automatic: it's this snippet's own `try`/`catch`, not a guarantee Loopress makes for snippets the way [failure isolation](/api/routes/#failure-isolation) does for routes. A snippet with an unguarded line that throws can break the very page it's hooked to, here, the media upload screen itself, so keeping a hook callback defensive, the way this one already is, matters more for a snippet than it does for a route.

## What this opens up

The same hook shape covers any file type WordPress already receives directly, extracting EXIF data from a photo, virus-scanning an upload before it's kept, anything that should happen the instant a file lands rather than on a separate call. If the upload doesn't go through WordPress's own media library at all, a headless frontend uploading straight to an object store and only telling WordPress about it afterward, that's the case a [Custom API Route](/api/routes/) still fits: there's no native WordPress hook to attach to when WordPress was never the one that received the file.
