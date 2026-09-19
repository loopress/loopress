---
"@loopress/wordpress-plugin": patch
"@loopress/cli": patch
---

Proof of concept for #234: `lps option push` now closes the WordPress-side race a write can still land in, on the one resource this lands on first (`option`).

`GET /options/{name}` now returns a `revision` (a content hash of the value). `option push` reads it right before writing each option, and sends it back as `expectedRevision`; `PUT /options/{name}` refuses the write (412) if the option's revision no longer matches, instead of silently overwriting whatever changed it in between. This is optimistic concurrency control within a single request, not a database-level atomic compare-and-swap: it shrinks the window down to this one request's own execution time, not to zero. The other 8 resource-state-backed resources (snippet, form, acf, api, hook, seo, menu, theme-styles) aren't covered yet, tracked in #234 as the remaining rollout.
