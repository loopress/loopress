---
"@loopress/cli": patch
---

`lps composer push` now reflects that the server resolves `composer.json` itself and never installs from the uploaded `composer.lock`. When the server's resolution moves a version your local lock had pinned, the command prints the drift and tells you to run `lps composer pull`. The `--json` output gains a `lockDrift` array. The MCP `composer_push` tool description is updated to match.
