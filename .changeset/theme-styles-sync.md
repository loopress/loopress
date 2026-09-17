---
"@loopress/cli": minor
"@loopress/mcp": minor
---

New `lps theme-styles pull/push/diff` command group syncs the active block theme's Global Styles customizations (Site Editor > Styles: colors, typography, spacing) as a local `theme/<stylesheet>-global-styles.json` file, reusing WordPress core's own `wp/v2/themes` and `wp/v2/global-styles/<id>` REST endpoints (no new PHP controller needed). Classic (non-block) themes fail the command clearly instead of syncing nothing silently. This resource is included automatically in `lps diff`, but deliberately left out of the aggregate `lps push`/`lps pull` (like `lps theme`), so a classic-theme site's routine sync isn't broken by this opt-in feature.

The MCP server gains matching `theme_styles_pull` and `theme_styles_push` tools, and `project_diff` now covers `theme-styles` too.
