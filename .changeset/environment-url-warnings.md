---
"@loopress/cli": minor
---

`lps option push`, `lps page push`, `lps theme template push` and `lps pattern push` now warn when a pushed value, page, template, template part or pattern holds an absolute URL to another environment of the project (a staging link about to land on production), `--dry-run` included. The URLs are never rewritten and the push still goes through; relative paths, links to the target environment and external links pass silently.
