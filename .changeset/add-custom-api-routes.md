---
"@loopress/wordpress-plugin": patch
"@loopress/cli": minor
---

Adds custom API routes: a versioned `api/` folder (`lps api push`/`pull`/`list` on the CLI) lets a project expose its own WP REST endpoints without hand-writing a plugin, deployed straight to `wp-content/loopress/api/` on Loopress Full and registered under `loopress-api/v1/<filename>`. One file, one class, one method per HTTP verb (`get`/`post`/`put`/`patch`/`delete`), resolved by filename convention (kebab-case -> PascalCase). Defaults to `manage_options` + Application Password auth like every other sync route, with explicit per-file overrides for `permission()` (e.g. an anonymous headless form endpoint) and `headers()` (CORS, including the OPTIONS preflight). Filenames are allowlisted against path traversal, deployed files get an auto-injected `ABSPATH` guard against direct HTTP access, and a bad file (parse error, class collision, throwing `permission()`/`headers()`) is skipped and logged rather than fataling `rest_api_init` or breaking other routes. Full only, like snippet sync: Light stays ACF+SEO only.
