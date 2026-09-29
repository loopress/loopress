---
"@loopress/cli": minor
"@loopress/mcp": minor
"@loopress/wordpress-plugin": minor
---

Block templates and parts: `templates/<slug>.html` and `parts/<slug>.html` are written by `lps template push` as the files of a child theme of the active block theme, `<parent>-loopress`, the parent staying untouched. Any template of the hierarchy can be overridden, and a template with a `title`/`postTypes` header becomes a page template a static page picks with its `template` header (no header or footer part gives a bare page). Edits made in the Site Editor are never overwritten and show up as drift in `lps template diff` and `lps diff`. Part of `lps push` (before pages), `lps dev`, `lps init` and `lps validate`. MCP gains `template_push`, `template_list` and `template_diff`.
