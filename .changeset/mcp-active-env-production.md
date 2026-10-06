---
"@loopress/cli": patch
"@loopress/mcp": patch
---

The MCP server now refuses a change to `production` even when `env` is omitted and `production` is the active environment. Before, only an explicit `env: "production"` was refused, so `hook_rm`, `api_rm`, a `*_rollback` or a `push` with `prune` could reach production without any human confirmation. A mutating tool called without `env` now resolves the active environment first and pins it, so the confirmed call also applies to the environment that was previewed, even if the active one is switched in between. `lps status --json` reports the resolved `environment` name for this.
