---
'@loopress/cli': minor
'@loopress/mcp': minor
---

`lps push` and `lps pull` (and so `lps promote`, `lps content copy`, `push_all` and `pull_all`) now include Global Styles once the project tracks them, on a site whose active theme is a block theme, and skip them with a one-line note otherwise. Theme versions stay with `lps theme push`. ACF, forms and snippets are skipped when the project has no directory for them, so `lps push --dry-run` (and the `push_all` preview) no longer fails with a 409 on a site without a form plugin, and `lps diff` no longer reports such a resource as inconclusive.
