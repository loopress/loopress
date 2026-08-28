---
"@loopress/mcp": minor
---

The MCP server now exposes `push_all` and `pull_all`, wrapping `lps push` and `lps pull` so an agent can sync every resource in one call instead of eight. `push_all` uses the same dry-run/confirmToken handshake as the other mutating tools.
