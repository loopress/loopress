---
"@loopress/cli": patch
---

`lps api push` now warns for each pushed route that runs with no authentication (`#[Permission(public: true)]`), and `lps api list` badges those routes `[PUBLIC]` (with a trailing warning). `lps api list --json` includes `"public"` per route. The MCP `api_list` tool exposes the same field.
