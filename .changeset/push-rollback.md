---
"@loopress/cli": minor
"@loopress/mcp": minor
---

Adds `lps <resource> rollback` for the 9 resource-state-backed resources (snippet, form, acf, api, hook, seo, menu, option, theme-styles). `lps <resource> push` now writes a snapshot of the environment's state (before and about-to-be-pushed) to a local, gitignored cache (`.loopress/snapshots/<resource>/`, capped at the last 10 per resource) right before every real push. `lps <resource> rollback` restores the most recent snapshot (or `--to <id>`), `--list` shows what's available. It refuses to overwrite a change made to the environment since the original push unless explicitly confirmed (interactive prompt, or `--yes`), the same shape as the production-push guard. No WordPress-side capability is required: restoring materializes the archived state into the resource's own local file layout, then delegates to the existing push command.

The MCP server gains a matching `<resource>_rollback` tool per resource, following the existing confirmToken handshake (`list: true` bypasses it as a plain read).
