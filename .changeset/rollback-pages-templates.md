---
"@loopress/cli": minor
---

`lps page rollback` and `lps theme template rollback` undo the last page or template push, the same way as every other rollback (`--list`, `--to`, `--dry-run`, the drift check and the production confirmation). The template rollback mirrors like its push: it brings back a template or part the push removed and removes one it added. The theme CSS comes back when the snapshot holds the CSS the site had before the push (pushed from the same machine, or none), otherwise the rollback keeps the pushed CSS and says so. `page_rollback` and `theme_template_rollback` are the matching MCP tools. `lps page diff` now also compares the full-width, hide-title and template headers.
