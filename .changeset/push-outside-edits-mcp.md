---
"@loopress/mcp": minor
---

`push_all`, `page_push` and every push tool with a matching `_rollback` tool take an optional `overwrite` boolean (the CLI's `--overwrite`): without it, a confirmed push over a change made on the site outside Loopress fails and names what it would overwrite.
