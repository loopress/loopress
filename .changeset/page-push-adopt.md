---
'@loopress/cli': minor
'@loopress/mcp': minor
'@loopress/wordpress-plugin': minor
---

`lps page push` can now take over a page with the same slug that Loopress did not create, instead of refusing it. It lists those pages and asks once, or takes them over directly with `--overwrite` (required in CI and through the MCP server). The page keeps its URL and ID, so menus, links and SEO data keep working, and its original content is saved as a WordPress revision first.
