# @loopress/mcp

## 0.22.0

### Minor Changes

- 2867b83: The MCP server now exposes `acf`, `seo` and `form` tools (`_push`, `_pull`, `_list`), matching the CLI. `acf_*` takes an optional `type` array and `seo_*` an optional `postType` array to scope the operation.
- 479525f: The MCP server now exposes `push_all` and `pull_all`, wrapping `lps push` and `lps pull` so an agent can sync every resource in one call instead of eight. `push_all` uses the same dry-run/confirmToken handshake as the other mutating tools.

## 0.21.0

### Minor Changes

- ddce917: Initial release of `@loopress/mcp`: an MCP (Model Context Protocol) stdio server exposing `lps` operations (`snippet`/`page`/`api` push/pull/list, `plugin`/`composer` push/pull, `project_status`) as tool calls for AI agents, plus a `loopress://project/config` resource. It wraps the existing `lps` binary as a subprocess rather than depending on `@loopress/cli` internals, see `obsidian/Product/Loopress MCP.md`.

  Mutating tools (`*_push`) use a two-call handshake: called without `confirmToken`, they run a `--dry-run` preview and return a single-use, 5-minute `confirmToken`; called again with that token, they apply exactly what was previewed. There is no way to skip the preview in a single call, including for a `production` environment.
