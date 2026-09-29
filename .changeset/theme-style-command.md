---
"@loopress/cli": minor
"@loopress/mcp": minor
---

Breaking: `lps theme-styles pull/push/diff/rollback` is now `lps theme style pull/push/diff/rollback`, grouped with the other theme commands. The `theme-styles` resource name for `lps diff --only/--skip` and the MCP tool names (`theme_styles_*`) are unchanged, and existing rollback snapshots still work.
