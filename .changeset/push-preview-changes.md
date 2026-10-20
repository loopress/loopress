---
"@loopress/cli": minor
"@loopress/mcp": minor
"@loopress/wordpress-plugin": minor
---

A push's dry run now says what it would change: each local item is `created`, `changed` or `unchanged` against the site, in the human output and under `changes` in `--json` (existing fields are kept). `lps acf push` also names the fields added, changed or removed in a changed field group, and `lps theme template push` lists templates, parts and CSS files separately, with `removed` for a file the child theme would drop. `lps push` and `lps theme push` now return each step's own result. The MCP push tools' previews are these results, and their descriptions now tell the agent so. The plugin's child theme endpoint reports a hash of each CSS file, so the dry run can tell whether the theme CSS changed.
