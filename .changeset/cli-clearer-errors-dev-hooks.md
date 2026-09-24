---
"@loopress/cli": patch
"@loopress/mcp": patch
---

`lps dev` now also watches `hooks/` and pushes hook files on change. A request the Loopress plugin refuses on purpose with a 403 (for example reading a secret-looking option) now shows the plugin's own reason instead of "Authentication failed, check your credentials", and HTML entities in server messages (`&quot;`) are decoded. Errors from the Loopress cloud API now show the API's own message (validation errors included) instead of a generic "Request failed with status code 400".

`lps validate` now checks JSON files at any depth (ACF's `acf/<type>/`, SEO's `post-meta/` and `redirects/` were silently skipped before), tracked option files (a missing `name`, `autoload` or `value` is reported), and the theme styles directory.

`lps plugin add` and `lps theme add` support `--json`, and the MCP server gets matching `plugin_add` and `theme_add` tools (local `loopress.json` edit only).

Rollback snapshots (`.loopress/snapshots/`, inside your project) hold the environment's full remote state; the `.loopress/` directory now writes its own `.gitignore` so they are never committed by accident.

`lps push`, `lps pull` and `lps promote` with `--json` now print a single valid JSON document: the progress output of the resource commands they run goes to stderr instead of polluting stdout, which broke the MCP `push_all`, `pull_all` and `project_promote` tools. A failed aggregate run now lists each failed resource and its reason.
