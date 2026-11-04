---
'@loopress/cli': minor
'@loopress/mcp': minor
---

New opt-in `--skip-unsupported` flag on `lps push`, `lps pull` and `lps diff`, passed on by `lps promote`. A resource the project uses but the site can't hold (ACF inactive, no form or snippet plugin, a Full feature on Loopress Light) is reported skipped with its reason instead of refusing the push or failing the pull, the run exits 0, `--json` carries `status: "skipped"` and the reason, and a final warning lists the skipped resources with how to fix them. Without the flag nothing changes. The MCP `push`, `pull`, `diff` and `promote` tools take a matching `skipUnsupported` input.
