---
'@loopress/cli': patch
---

Internal refactoring, shared helpers (CLI backlog lot 2). No visible behavior change.

- One shared orphan-file detection used by the five pull commands (acf, api, form, seo, snippet).
- One shared directory loader (per-file parse and validation, corrupted files skipped with a warning, missing directory means empty) used by acf push and api push.
- PushCommand now carries failedCount and the Listr task failure reporting used by the six push commands.
- Single API_URL definition, shared toSlug() helper, snippet and seo file-format functions moved to utils/.
