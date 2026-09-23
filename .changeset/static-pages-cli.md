---
"@loopress/cli": minor
"@loopress/mcp": minor
---

Adds `lps page push [SLUG]`, `lps page list` and `lps page diff` for static HTML pages (`pages/<slug>.html`, `pageDir` in `loopress.json`), with an optional `<!-- title: ... / status: draft|publish -->` header. Pages are part of `lps push`, `lps diff --only page`, `lps dev` and `lps init`, and are checked by `lps validate`. The MCP server gets matching `page_push`, `page_list` and `page_diff` tools, and a CLI command that exits non-zero with a regular JSON payload (a diff reporting drift) is now returned as a result instead of an error. Requires Loopress Full.
