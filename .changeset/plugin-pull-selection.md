---
"@loopress/cli": minor
"@loopress/mcp": minor
---

`lps plugin pull` no longer adds every plugin installed on the site. Plugins the project already tracks are refreshed, and the others are offered as a list to tick, unticked by default, so a pull from production doesn't bring its cache, security or backup plugins into the project. Without a terminal (`--yes`, `--json`, CI, the MCP server), only tracked plugins and those named with the new `--plugin <slug>` flag are written; the MCP `plugin_pull` tool takes them as `plugins`.

Plugins under `require-dev` in `composer.json` are now installed on the `local` environment by `lps plugin push` and `lps composer push`, and still never on a remote site: use it for Query Monitor, or for a premium plugin's free edition while production runs the paid one.
