---
"@loopress/cli": patch
---

`lps form push` and `lps seo push` gain opt-in flags for the sync operations the server now gates:

- `lps form push --allow-notifications` also pushes each form's notification and confirmation settings (off by default, so a stray push cannot redirect submissions).
- `lps seo push --allow-external-redirects` permits pushing a redirect whose target is on another site (rejected by default).

The MCP `seo_push` tool gains `allowExternalRedirects`. `form_push` via MCP always uses the safe default (notifications preserved); the opt-in is CLI-only by design.
