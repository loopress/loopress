---
"@loopress/cli": patch
---

On Loopress Light, `lps composer push`, `lps app list`, `lps plugin push` and `lps theme template list|push|diff|rollback` now answer `Not supported by <site>: ... need Loopress Full` (exit 2) instead of a raw 404. `lps diff` names the same reason for a resource the site cannot hold, and the push, pull and promote refusals end with a hint to pass `--skip-unsupported`. `lps plugin outdated`, `lps plugin update` and `lps plugin audit` work from `loopress.json` alone, with no configured project or environment. `lps option add` checks a reserved Windows file name before any request to the site.
