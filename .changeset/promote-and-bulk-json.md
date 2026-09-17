---
"@loopress/cli": minor
"@loopress/mcp": minor
---

`lps push`, `lps pull`, and `lps promote` now support `--json` (each returns a structured per-resource result instead of erroring with "Nonexistent flag: --json"). This was a real bug in the MCP server's `push_all` and `pull_all` tools, which always shell out with `--json` and so always failed.

The MCP server also gains `project_promote`, the tool for `lps promote` that CLI parity was missing.
