---
"@loopress/cli": minor
"@loopress/mcp": minor
"@loopress/wordpress-plugin": patch
---

Added `options/`, a new resource for tracking individual WordPress options (`wp_options` rows) directly, agnostic of which plugin owns them: no adapter to write, unlike `seo/` which has to know Yoast's vs RankMath's option names and shape. `lps option list` shows every option name and autoload flag on the site (never values, so browsing stays cheap and never leaks a value by accident), `lps option add <name>` starts tracking one as a local file, and `lps option pull`/`push`/`diff`/`remove` work the tracked set from there (`push` is upsert-only, it never deletes an untracked option). Two safety rails: `active_plugins`/`template`/`stylesheet` are refused outright (already owned by the `plugin`/`theme` resources), and environment-owned or WordPress-generated options (`siteurl`, `home`, `db_version`, `cron`, `rewrite_rules`, `WPLANG`) default to `"readonly": true` in their local file, tracked and diffable but skipped by `push` unless explicitly overridden. Mirrored as `option_push`/`option_pull`/`option_list`/`option_add`/`option_remove` MCP tools.
