---
title: ACF Sync
description: REST endpoints for syncing Advanced Custom Fields field groups via the Loopress CLI.
badge:
  text: Beta
  variant: caution
---

import { Aside } from '@astrojs/starlight/components';

<Aside type="caution" title="Beta feature">
ACF sync requires **Advanced Custom Fields** (free or Pro) to be installed and activated. If ACF is not active, all endpoints return `400 Bad Request`.
</Aside>

The Loopress plugin exposes a REST API that the Loopress CLI uses to pull and push ACF field group definitions. The admin UI does not surface ACF features directly; use the CLI.

## Requirements

- Advanced Custom Fields (free or Pro) installed and active
- Loopress plugin installed and active
- Administrator role (`manage_options` capability)

## REST API

### `GET /wp-json/lps/v1/acf/field-groups`

Returns all ACF field groups with their nested fields.

**Response:**

```json
[
  {
    "key": "group_64abc123",
    "title": "Product Details",
    "fields": [
      {
        "key": "field_64abc124",
        "label": "Price",
        "name": "price",
        "type": "number"
      }
    ],
    "location": [...]
  }
]
```

### `POST /wp-json/lps/v1/acf/field-groups`

Import a field group. The request body must be a valid ACF field group object with a `key` property. Equivalent to ACF's own **Tools → Import** feature.

**Request body:**

```json
{
  "key": "group_64abc123",
  "title": "Product Details",
  "fields": [...],
  "location": [...]
}
```

**Response:** The imported field group object as returned by ACF.

## CLI usage

→ See [ACF Field Groups (CLI)](/cli/acf/) for the `lps acf pull` and `lps acf push` commands.

## Error responses

| Status | Cause |
|--------|-------|
| `400` | ACF plugin is not active |
| `400` | Missing `key` in POST body |
| `403` | Caller does not have `manage_options` capability |
