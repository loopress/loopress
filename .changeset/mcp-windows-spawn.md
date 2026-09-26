---
"@loopress/mcp": patch
"@loopress/cli": patch
---

Fix the MCP server on Windows: every tool failed with `ENOENT` because it spawned `lps` without a shell, and Windows installs it as `lps.cmd`, which Node refuses to run directly. The server now starts the installed CLI's `bin/run.js` with its own Node, falling back to `lps` on `PATH` through `tinyexec`, which also works on Windows. `LPS_BIN` also accepts a `.js` file. `@loopress/cli` now exports its `package.json`, and the MCP server now declares Node 22 or later, like the CLI.

`lps init` now adds `* text=auto eol=lf` to `.gitattributes`, so a checkout on Windows (CRLF by default) keeps the same bytes as what `pull` writes.
