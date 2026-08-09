---
title: On-the-Fly Image Transforms in WordPress with Intervention Image
description: A Custom API Route that resizes and re-encodes a media library image to whatever dimensions a frontend asks for, using Intervention Image, without registering a new WordPress image size for every case.
kind: route
draft: true
---

WordPress generates image sizes at upload time, `thumbnail`, `medium`, whatever `add_image_size()` registered. That works when you know every size you'll need in advance. A headless frontend rarely does: a design system asking for a 342x180 crop for one card layout and a 96x96 circular avatar for another isn't a case of "register two more sizes", it's every component potentially wanting its own dimensions, and registering a size for each one means regenerating the whole media library every time a designer changes a number.

## Why this needs a package

`WP_Query` and the media functions give you the original file and whatever sizes were pre-generated. Resizing, cropping, re-encoding to another format on request is image processing, and PHP's built-in GD functions are low-level enough (`imagecreatetruecolor`, manual aspect-ratio math, manual format-specific encode calls) that most projects reach for a wrapper. [Intervention Image](https://packagist.org/packages/intervention/image) (`intervention/image`) is the common one, a fluent API over GD or Imagick.

## The route

```php title="api/image/[attachment_id].php"
<?php

declare(strict_types=1);

use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\ImageManager;

class Image
{
    public function get(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $attachmentId = (int) $request->get_param('attachment_id');
        $path         = get_attached_file($attachmentId);

        if ($path === false || !file_exists($path)) {
            return new WP_Error('not_found', 'No attachment with that id.', ['status' => 404]);
        }

        $width  = (int) ($request->get_param('width') ?: 400);
        $height = (int) ($request->get_param('height') ?: 400);

        $manager = new ImageManager(new Driver());
        $image   = $manager->read($path);
        $image->cover($width, $height); // resize + crop to exactly fill the box, no distortion

        // TODO: verify exact encode method name and quality parameter against Intervention Image
        // v3's current docs, the encode API changed between v2 and v3.
        $encoded = $image->toWebp(80);

        $response = new WP_REST_Response([
            'width'    => $width,
            'height'   => $height,
            'data_uri' => 'data:image/webp;base64,' . base64_encode((string) $encoded),
        ]);
        $response->header('Cache-Control', 'public, max-age=86400');

        return $response;
    }
}
```

```bash
composer require intervention/image
lps composer push
```

Base64 inside a JSON envelope is the documented shape a route's binary output takes here (an `array` or `WP_REST_Response` body goes through WordPress's normal REST JSON serialization), and for an image specifically it isn't really a workaround: a `data:image/webp;base64,...` string is exactly what an `<img src>` or a CSS `background-image` wants directly, no separate request needed.

## Now call it

```bash
curl "https://your-site.com/wp-json/loopress-api/v1/image/930?width=342&height=180"
```

```json
{"width": 342, "height": 180, "data_uri": "data:image/webp;base64,UklGRi4AAABXRUJQVlA4TCEAAAAvA..."}
```

## Permission

Media library images are already public through their normal URLs, a resized version of one isn't more sensitive than the original, so this route is explicitly opened up rather than left on the closed default:

```php
use Loopress\Api\Attribute\Permission;

#[Permission(public: true)]
class Image
{
    // ...
}
```

Worth noticing: nothing here validates that `width` and `height` stay within a sane range. A request for a 20000x20000 image is a valid request as far as this code is concerned, and image processing is exactly the kind of work where that turns into a slow request or a memory spike. Clamping both to a fixed maximum before they reach `cover()` is a one-line addition, and a real deployment of this route shouldn't ship without it.

## A missing package fails the one request, not the site

Push this route without `intervention/image` installed and `new ImageManager(...)` is an undefined class, an ordinary PHP error scoped to that request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, before any route loads, a single package missing from an intact `vendor/` isn't something it catches on your behalf. Install the package through [Composer dependency management](/composer/) before deploying a route that depends on it.

## What this opens up

Cropping is the obvious case, but the same route shape covers watermarking product photos, stripping EXIF data before serving an image publicly, or converting an upload to a consistent format on the way out. It's also a small enough contract, one dynamic segment, two query params, one transform, that it's a reasonable thing to hand an AI coding assistant to draft in one pass and actually review the diff.
