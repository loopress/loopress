---
"@loopress/cli": minor
"@loopress/mcp": patch
"@loopress/wordpress-plugin": minor
---

Loopress Light no longer breaks the aggregate commands. `GET loopress/v1/capabilities` now lists the site's `modules`, and `lps pull`, `lps push` (dry run included), `lps diff` and so `lps promote` skip a Full-only step ("needs Loopress Full") when the project has no files for it. When it does, `lps push` refuses before pushing anything, `lps pull` and `lps diff` report it. `lps push` and `lps theme push` skip templates and parts when the project has none and doesn't set `activateChildTheme`, and `lps theme template push` alone refuses with "Nothing to push". The removed SEO module warning is gone.
