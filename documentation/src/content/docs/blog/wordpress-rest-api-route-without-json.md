---
title: When a WordPress REST Route Shouldn't Return JSON
description: PDFs, spreadsheets, calendar feeds, Markdown, images. The WordPress REST API assumes JSON, but plenty of real endpoints shouldn't answer with it. Three response shapes for a custom route, and how to choose from who's calling.
date: 2026-09-27
draft: true
cliVersion: 0.26.0
wordpressPluginVersion: 2026.11.0
authors:
  - maxime
tags:
  - rest api
  - wordpress
  - php
excerpt: The WordPress REST API speaks JSON, so every route ends up returning JSON, even when the thing calling it is a calendar app, a spreadsheet download, or an AI crawler. Pick the response shape from the caller instead.
---

The WordPress REST API is built around JSON. Return an array from a callback, WordPress serializes it, sets `Content-Type: application/json`, done. It's such a good default that it becomes the only answer, and then you find yourself base64-encoding a PDF into a JSON field so a browser can... decode it back into a PDF.

The question that decides the response shape isn't "what does the route produce". It's **who calls it, and what do they do with the answer**. Across the [cookbook](/cookbook/) recipes we've built with [custom API routes](/api/routes/), three shapes cover everything.

## Shape 1: JSON, for code that reads fields

A frontend `fetch()`, a mobile app, a CI script: the caller parses the response and picks fields out of it. That's what JSON is for, and what a route gives you by returning an array or a `WP_REST_Response`:

```php
public function get(WP_REST_Request $request): array
{
    return ['id' => 482, 'status' => 'valid'];
}
```

Nothing to decide here. It's the default because it's the right answer most of the time.

## Shape 2: a file inside JSON, as a data URI

Sometimes the caller is still code, but what it wants is a small image to drop into the page: a resized thumbnail, a ticket's QR code. The route can put the image in a JSON field as a `data:` URI:

```php
return new WP_REST_Response([
    'data_uri' => 'data:image/png;base64,' . base64_encode($result->getString()),
]);
```

The frontend sets it straight as `<img src>`, no second request, and the JSON envelope can carry other fields next to it (dimensions, an expiry). We use this for [ticket QR codes](https://github.com/loopress/demo/tree/main/qr-code-generation-wordpress-rest-api) and on-the-fly image resizing.

The limits are real, so keep it for small files. Base64 makes the payload a third bigger than the raw bytes. The browser can't cache the image on its own, only the whole JSON response. And a human can't open the URL and see the image, they see a wall of base64. Our QR code is a 519-byte PNG, 737 bytes as JSON: fine. A 2 MB photo as JSON is not.

## Shape 3: raw bytes, with your own headers

When the caller isn't your code at all, JSON is simply wrong:

- **A browser navigating to the URL**, from a "Download invoice" link: it needs `Content-Type: application/pdf` and a `Content-Disposition` header, or it shows gibberish.
- **A calendar app subscribed to a feed**: it expects `text/calendar`, and never sends anything WordPress could negotiate on.
- **`curl -o report.xlsx`** in someone's cron job: it writes whatever bytes arrive to disk.
- **An AI crawler or an `llms.txt` consumer**: it wants `text/markdown`, not HTML in a JSON string.

A route verb method doesn't have to return anything. It can send its own headers, echo the body, and stop:

```php
public function get(): void
{
    // ... build $xlsxBytes
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment; filename="orders.xlsx"');
    echo $xlsxBytes;
    exit;
}
```

That's the whole trick, documented as [streaming a file instead of JSON](/api/routes/#streaming-a-file-instead-of-json). Our [WooCommerce orders to Excel](/cookbook/documents-and-files/spreadsheet-export-phpspreadsheet-wordpress-rest-api/) and [post to PDF](/cookbook/documents-and-files/post-to-pdf-dompdf-wordpress-rest-api/) recipes both work this way, and so do a calendar feed and a Markdown export we're writing up next.

Three things we checked on a real site, so you don't have to:

- **Errors can still be JSON.** Return a `WP_Error` *before* the headers go out and WordPress answers it like any other REST error, `{"code":"not_found",...,"data":{"status":404}}`. Only the success path is raw. A caller that gets a 404 shouldn't have to parse a PDF to find out.
- **WordPress's own REST headers are already there.** The response to our calendar feed still carried `Access-Control-Expose-Headers` and the API `Link` header, WordPress sends those before your method runs. What `exit` skips is everything after it: the JSON serialization, and the `rest_post_dispatch` filters other plugins might hook.
- **Permissions work the same.** `permission()` and `#[Permission]` are checked before the verb method ever runs, raw output or not. Our Excel export is admin-only, the curl in its video authenticates with an Application Password like any other REST call.

## Choosing, in one line each

| The caller | The shape |
|------------|-----------|
| Your code, reading fields | JSON |
| Your code, showing a small image | data URI in JSON |
| A browser link, a download, `curl -o` | raw bytes + `Content-Disposition` |
| A calendar app, a feed reader, a crawler | raw bytes + the format's own `Content-Type` |

The mistake isn't picking the wrong one of these. It's never asking the question, and shipping JSON to a calendar app because that's what the REST API does by default.

---

```bash
npm install -g @loopress/cli
```

Custom API routes and Composer dependency management are [Loopress Full](/wordpress-plugin/) features, free. [Writing Route Files](/api/routes/) covers the rest: dynamic segments, verbs, permissions, CORS.
