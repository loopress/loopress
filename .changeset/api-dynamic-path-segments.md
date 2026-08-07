---
"@loopress/wordpress-plugin": minor
"@loopress/cli": minor
---

`api/` route files can now use a bracketed segment, `[order_id]`, anywhere in their path (e.g. `api/invoice-pdf/[order_id].php`, `api/orders/[order_id]/items/[item_id].php`) to capture a dynamic value into `$request->get_param(...)`, the same convention as Astro/Next.js dynamic routes, without a catch-all segment.

`lps api push`/`pull`/`list` now support route files nested in subdirectories, needed for the above. **Internal, breaking**: the upload endpoint (`PUT loopress/v1/api-files`) now takes `filename` as a body field instead of a URL path segment (avoids depending on how a given host handles a percent-encoded slash in a URL), so the CLI and the WordPress plugin must be upgraded together, an old CLI against a new plugin (or the reverse) will fail to push.
