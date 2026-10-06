---
"@loopress/cli": patch
"@loopress/mcp": patch
---

`lps acf`, `lps seo`, `lps form`, `lps menu` and `lps theme style` `push`/`pull` now accept `--json`. The MCP server runs every command with `--json`, so `acf_push`, `acf_pull`, `seo_push`, `seo_pull`, `form_push`, `form_pull`, `menu_push`, `menu_pull`, `theme_styles_push` and `theme_styles_pull` always failed with "Nonexistent flag: --json". A test now checks that every command the MCP server can call supports `--json`.
