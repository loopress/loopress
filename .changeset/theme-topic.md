---
'@loopress/cli': minor
'@loopress/mcp': minor
---

Breaking: everything theme related now lives under `lps theme`. `lps template push/list/diff` is now `lps theme template push/list/diff`, and the versions-only `lps theme push/pull` is now `lps theme version push/pull`. `lps theme push` now pushes the whole topic in order (versions, then templates and parts, then Global Styles), and `lps theme pull` pulls versions and Global Styles. `lps theme style push` accepts `--yes`. In the MCP server, `theme_push`/`theme_pull` now wrap the whole topic, the new `theme_version_push`/`theme_version_pull` keep the versions-only behavior, and the `template_*` tool names are unchanged. The `template` and `part` resource names for `lps diff --only/--skip` are unchanged.
