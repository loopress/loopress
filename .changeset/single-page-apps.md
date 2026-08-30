---
"@loopress/wordpress-plugin": minor
"@loopress/cli": minor
"@loopress/mcp": minor
---

Add single-page app hosting (Loopress Full only). An `apps/<name>/` directory holds a `loopress.app.json` and a built `dist/` folder; `lps app push` ships the bundle to `wp-content/loopress/apps/<name>/` over the REST API (content hashed, only changed files uploaded, one atomic commit), and the `[loopress_app name="..."]` shortcode enqueues its entry files and prints the mount point. Loopress ships the pre-built output, it does not run the build.

New CLI commands: `lps app push [name]`, `lps app pull [path]`, `lps app list`, `lps app remove <name>`, plus an `appsDir` key in `loopress.json`. New MCP tools: `app_push`, `app_pull`, `app_list`, `app_remove`. Hash routing only; the previous build's files are kept one generation so in-flight sessions do not 404 on a lazy chunk. No rollback or version history.
