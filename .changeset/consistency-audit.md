---
"@loopress/cli": patch
"@loopress/mcp": patch
---

Consistency fixes from the 2026-10-27 audit. `lps api` and `lps hook` help examples pass the directory as a positional argument (there is no `--path` flag), and the public-route warning links to docs.loopress.dev. `lps --help` describes the `app`, `form`, `hook`, `menu`, `option` and `page` topics. The MCP server reports its real version, and its missing-project error names `lps init`. Docs: API route and hook pushes are all or nothing, the declared resources appear in the workflow page, plus the snippet sidecar fields, the `project config` prompts and the push exceptions that do delete.
