---
"@loopress/wordpress-plugin": patch
"@loopress/cli": patch
---

Continues #234's rollout: `lps menu push` now closes the same WordPress-side race that `option push` closed in #235, this time for the `menu` resource.

`GET /menus/{slug}` (and the upsert response) now return a `revision` (a content hash of the menu's `name` and `items`). `menu push` reads it right before pushing each menu, and sends it back as `expectedRevision`; `POST /menus` refuses the write (412) if the menu's revision no longer matches, instead of silently overwriting whatever changed it in between. This is optimistic concurrency control within a single request, not a database-level atomic compare-and-swap: it shrinks the window down to this one request's own execution time, not to zero. A menu that doesn't exist remotely yet has nothing to condition on, so a first push is unchanged. The other 7 resource-state-backed resources (snippet, form, acf, api, hook, seo, theme-styles) aren't covered yet, tracked in #234 as the remaining rollout.
