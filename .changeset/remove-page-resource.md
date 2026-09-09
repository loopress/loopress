---
"@loopress/cli": minor
"@loopress/mcp": minor
---

**Breaking:** removed the `page` resource. `lps page pull`/`push`/`list`/`diff`, the `page_pull`/`page_push`/`page_list` MCP tools, the `pageDir` setting in `loopress.json`, and the `pages` entry for `lps dev` / `lps diff --only` are all gone. `lps push`/`pull` no longer touch pages. WordPress pages are core content editable in wp-admin or over `wp/v2/pages` directly; keep them under version control with a general-purpose WP-CLI export if needed.
