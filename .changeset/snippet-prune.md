---
"@loopress/cli": minor
"@loopress/mcp": minor
---

`lps snippet push` (and the snippets step of `lps push`) now deletes site snippets that have no local file, like `lps hook push` and `lps api push`: they are listed first, `--dry-run` shows them, `--no-prune` keeps them, and production asks before deleting. It refuses when the snippets directory is empty but the site has snippets. New `lps snippet rm <id>` (and `snippet_rm` in the MCP server). A snippet id in a sidecar that has never been pushed to the environment is now checked against the site: if the snippet there has another name, the push refuses and names both, `--overwrite` forces it.
