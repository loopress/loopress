---
"@loopress/cli": minor
"@loopress/mcp": minor
---

New `lps plugin update [slug...]`: rewrites plugin versions in `loopress.json` to the latest WordPress.org release, for every plugin or only the named ones, without touching the site (`lps plugin push` applies them). `--minor` and `--patch` cap the jump, `--dry-run` previews and `--json` lists the changes. New MCP tool `plugin_update`.
