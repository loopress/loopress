---
"@loopress/cli": minor
"@loopress/mcp": minor
---

`lps doctor` now supports `--json`, returning a structured `{project, environment, url, checks, ok, pluginVersion}` result instead of throwing on failure (its human-readable output and exit code are unchanged).

The MCP server gains three read-only tools that were missing from CLI parity: `project_diff` (drift between local files and an environment, or between two environments), `project_doctor` (connectivity, plugin and credential diagnostics), and `validate_local` (checks local tracked files without contacting WordPress).
