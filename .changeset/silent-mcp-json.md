---
"@loopress/cli": minor
---

`--json` now works consistently across `snippet`/`page`/`api`/`plugin`/`composer` push/pull/list and `status`: each command returns a structured result (shape documented per command) instead of the interactive progress UI, and errors come through as `{error: {message, name}}` with a non-zero exit code. `snippet list`/`page list`/`api list` previously had their own one-off `--json`/`-j` flag; they now use the same oclif mechanism as everything else. First step towards a `@loopress/mcp` server that wraps `lps` instead of duplicating its logic, see `obsidian/Product/Loopress MCP.md`.
