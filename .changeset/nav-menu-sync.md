---
"@loopress/wordpress-plugin": minor
"@loopress/cli": minor
"@loopress/mcp": minor
---

Adds a `menu` resource for syncing WordPress navigation menus and menu locations. The plugin exposes `loopress/v1/menus` and `loopress/v1/menu-locations` REST endpoints, resolving menu items by identity (post type/taxonomy + slug) rather than raw object ids so they remain portable between environments. The CLI gains `lps menu list/pull/push/diff`, wired into `lps push`/`lps pull`/`lps diff`/`lps init` and local file validation, and the MCP server gains matching `menu_push`/`menu_pull`/`menu_list` tools.
