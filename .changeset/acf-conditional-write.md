---
"@loopress/wordpress-plugin": patch
"@loopress/cli": patch
---

Extends #234's conditional write to the `acf` resource: `lps acf push` now closes the WordPress-side race a write can still land in for field groups, post types, taxonomies, and options pages, the same way it was already closed for `option` in #235.

`GET /acf/{type}/{key}` now returns a `revision` (a content hash of the exported object, excluding fields ACF itself computes such as `modified`). `acf push` reads it right before writing each object, and sends it back as `expectedRevision`; `POST /acf/{type}` refuses the write (412) if the object's revision no longer matches, instead of silently overwriting whatever changed it in between. This is optimistic concurrency control within a single request, not a database-level atomic compare-and-swap: it shrinks the window down to this one request's own execution time, not to zero. The remaining 7 resource-state-backed resources (snippet, form, api, hook, seo, menu, theme-styles) aren't covered yet, tracked in #234 as the remaining rollout.
