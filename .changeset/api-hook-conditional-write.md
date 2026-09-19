---
"@loopress/wordpress-plugin": patch
"@loopress/cli": patch
---

Extends #234's conditional-write pattern (introduced for `option` in #235) to the two file-based resources, `api` and `hook`, which share the same `AbstractFilesController`/`AbstractFilesDirectory` base classes.

`GET /api-files` and `GET /hook-files` now return a `revision` (a content hash) per file, and `PUT` returns one too on a successful push. `api push` and `hook push` compute each file's expected revision from the remote listing already read for the push's own rollback snapshot, no extra network round trip, and send it back as `expectedRevision`; the server refuses the write (412) if the file's revision no longer matches, instead of silently overwriting whatever changed it in between. A file with no remote counterpart yet (a first push) has nothing to condition on, so it falls back to today's unconditional create. This is optimistic concurrency control within a single request, not a database-level atomic compare-and-swap: it shrinks the window down to this one request's own execution time, not to zero.

The remaining 6 resource-state-backed resources (snippet, form, acf, seo, menu, theme-styles) aren't covered yet, tracked in #234 as the remaining rollout.
