---
"@loopress/wordpress-plugin": patch
"@loopress/cli": patch
---

Closes the WordPress-side race `lps snippet push` could still land in (#234), extending the conditional write introduced for `option` to the `snippet` resource.

`GET /snippets/{id}` (and the `create`/`update` responses) now return a `revision`, a content hash of every field an update can change (code, active state, location, priority, and the rest). `snippet push` reads it right before writing each already-known snippet, and sends it back as `expectedRevision`; `PUT /snippets/{id}` refuses the write (412) if the snippet's revision no longer matches, instead of silently overwriting whatever changed it in between. A first push (no known remote id yet) is unaffected, it still falls through to a plain create. This is optimistic concurrency control within a single request, not a database-level atomic compare-and-swap. The remaining resource-state-backed resources (form, acf, api, hook, seo, menu, theme-styles) aren't covered yet, tracked in #234.
