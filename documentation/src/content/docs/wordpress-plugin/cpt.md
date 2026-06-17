---
title: Custom Post Type API
description: Read-only REST endpoints for querying custom post types via the Loopress plugin.
badge:
  text: Beta
  variant: caution
---

import { Aside } from '@astrojs/starlight/components';

<Aside type="caution" title="Beta feature">
The CPT API is a read-only convenience wrapper. It exposes posts with their meta in a single request, suitable for headless or CLI use cases.
</Aside>

The Loopress plugin registers read-only REST endpoints for any registered custom post type. This lets you query CPT content without building a custom endpoint or dealing with multiple requests for meta.

## Requirements

- The post type must be registered with WordPress (via a theme, plugin, or code snippet)
- Administrator role (`manage_options` capability)

## REST API

### `GET /wp-json/lps/v1/cpt/{post_type}`

List all posts of a given post type. `{post_type}` must be a registered post type slug.

**Example:**

```bash
curl -H "X-WP-Nonce: <nonce>" \
  https://example.com/wp-json/lps/v1/cpt/product
```

**Response:**

```json
[
  {
    "id": 42,
    "title": "My Product",
    "content": "Product description...",
    "status": "publish",
    "created_at": "2024-01-15 10:00:00",
    "updated_at": "2024-03-01 14:30:00",
    "meta": {
      "_price": ["29.99"],
      "_sku": ["PROD-001"]
    }
  }
]
```

### `GET /wp-json/lps/v1/cpt/{post_type}/{id}`

Retrieve a single post by ID. Returns `404` if the post does not exist or belongs to a different post type.

**Example:**

```bash
curl -H "X-WP-Nonce: <nonce>" \
  https://example.com/wp-json/lps/v1/cpt/product/42
```

## Error responses

| Status | Cause |
|--------|-------|
| `400` | `{post_type}` is not a registered post type |
| `403` | Caller does not have `manage_options` capability |
| `404` | Post not found or wrong post type |

## Notes

- Post meta is returned via `get_post_meta()`, all meta keys for the post are included
- Posts with any status (`publish`, `draft`, `private`, etc.) are returned
- This endpoint is read-only; creating or updating posts is not supported
