---
"@loopress/cli": minor
"@loopress/mcp": minor
---

New `lps plugin outdated`: compares each plugin of `loopress.json` to the latest WordPress.org version and prints the slug, current and latest versions and the jump (major, minor, patch). Plugins not on WordPress.org are listed as unknown, `--json` gives a machine-readable result, and the command exits 1 when a plugin is behind, so it works in CI. New MCP tool `plugin_outdated`.
