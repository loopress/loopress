---
"@loopress/cli": minor
"@loopress/mcp": minor
"@loopress/wordpress-plugin": minor
---

Custom block templates: a `templates/` folder of `<slug>.html` block templates, pushed as custom templates of the active block theme with `lps template push` (plus `list` and `diff`, part of `lps push`, `lps diff` and `lps dev`), that a static page picks with its `template` header. A template without header and footer parts gives a bare page. WordPress and theme templates are never overridden. MCP gains `template_push`, `template_list` and `template_diff`.
