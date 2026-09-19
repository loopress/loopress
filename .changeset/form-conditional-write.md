---
"@loopress/wordpress-plugin": patch
"@loopress/cli": patch
---

Extends #234's conditional write to `form`: `lps form push` now closes the same WordPress-side race that `option push` already closed.

`GET /forms/{id}` (and the create/update responses) now return a `revision` (a content hash of the form's canonical state as reported by whichever form plugin is currently active, minus its `id` and its own save-bookkeeping fields). `form push` reads it right before writing each existing form, and sends it back as `expectedRevision`; `PUT /forms/{id}` refuses the write (412) if the form's revision no longer matches, instead of silently overwriting whatever changed it in between. A form with no local id yet (a first push) has nothing to condition on, so it falls back to today's unconditional create, same as `option push`. This is optimistic concurrency control within a single request, not a database-level atomic compare-and-swap: it shrinks the window down to this one request's own execution time, not to zero. The remaining resource-state-backed resources (snippet, acf, api, hook, seo, menu, theme-styles) aren't covered yet, tracked in #234 as the remaining rollout.
