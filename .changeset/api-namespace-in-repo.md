---
"@loopress/cli": minor
---

The namespace of your custom API routes now lives in `loopress.json` as `api.namespace` (default `loopress-api/v1`). `lps api push` sends it before the routes, `lps api pull` writes the site's value, `lps api diff` and `lps diff` report a difference, and `lps validate` checks the format, refusing `loopress/v1`. `lps project push` no longer sends Application Passwords to the Loopress API: it only syncs project and environment names and URLs, so each developer creates their own Application Password with `lps project config`.
