# @loopress/mcp

An MCP (Model Context Protocol) server exposing Loopress CLI operations as tool calls, so an AI
agent can pull and push snippets, pages, API routes, plugins and Composer dependencies on a
WordPress site, plus check project status. Ships as the `lps-mcp` binary.

It does not reimplement any of that logic: every tool shells out to the `lps` binary already on
`PATH` with `--json`, and parses its stdout. No direct dependency on `@loopress/cli`.

## Requirements

- [`@loopress/cli`](../cli) installed and on `PATH` (`npm install -g @loopress/cli`)
- A `loopress.json` already set up in the directory the MCP client launches the server from
  (`lps init`), since tools resolve paths relative to that `cwd`, same as running `lps` by hand
- WordPress authentication already done via the CLI (`lps project config`). The MCP server itself
  never handles auth, it only calls `lps`, which reads the stored Application Password.

## Installation

```bash
npm install -g @loopress/mcp
```

Then point your MCP client at the `lps-mcp` binary. For example, in Claude Code:

```bash
claude mcp add loopress -- lps-mcp
```

Or in a JSON-based client config (Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "loopress": {
      "command": "lps-mcp"
    }
  }
}
```

The server communicates over stdio and takes no CLI arguments of its own.

## Tools

| Tool | Mutating | Args | Description |
|------|----------|------|-------------|
| `snippet_push` | Yes | `env?`, `path?`, `confirmToken?` | Push local snippet files to WordPress |
| `snippet_pull` | No | `env?`, `path?` | Pull snippets from WordPress into local files |
| `snippet_list` | No | `env?` | List snippets currently on WordPress |
| `page_push` | Yes | `env?`, `path?`, `confirmToken?` | Push local page files to WordPress |
| `page_pull` | No | `env?`, `path?` | Pull pages from WordPress into local files |
| `page_list` | No | `env?` | List pages currently on WordPress |
| `api_push` | Yes | `env?`, `path?`, `confirmToken?` | Push local custom API route files to WordPress |
| `api_pull` | No | `env?`, `path?` | Pull custom API route files from WordPress |
| `api_list` | No | `env?` | List custom API route files currently on WordPress |
| `plugin_push` | Yes | `env?`, `confirmToken?` | Install/activate WordPress.org plugins to match `loopress.json` |
| `plugin_pull` | No | `env?` | Pull installed plugins from WordPress into `loopress.json` |
| `composer_push` | Yes | `env?`, `confirmToken?` | Push `composer.json`/`composer.lock` and run `composer install` on WordPress |
| `composer_pull` | No | `env?` | Pull `composer.json`/`composer.lock` from WordPress |
| `project_status` | No | `env?` | Show which project and environment the other tools will target |

`env` overrides the globally active environment for that call. `path` overrides the directory
configured in `loopress.json` for that feature.

## Confirmation handshake

Every mutating tool (anything that reaches a real WordPress site) requires two calls:

1. **Call without `confirmToken`**: runs `lps ... --dry-run`, returns the preview plus a
   single-use `confirmToken` (UUID, expires after 5 minutes, capped at 100 pending tokens
   process-wide).
2. **Call again with that `confirmToken`**: runs the real command, using the args captured at
   preview time, not whatever the second call resends, so what gets applied can never drift from
   what was previewed.

There is no way to skip the preview and apply in one call, including against a `production`
environment: no tool schema exposes a flag for it.

## Resource

`loopress://project/config`, the raw contents of `loopress.json` in the current directory. Returns
`{"error": {"name": "NO_PROJECT_CONFIG", "message": "..."}}` if the file doesn't exist.

## Errors

Tool results set `isError: true` with a JSON payload `{"error": {"name", "message"}}`. Error names:

| Name | Meaning |
|------|---------|
| `TIMEOUT` | The underlying `lps` command exceeded its timeout (120s by default, 620s for `composer_push`) |
| `ExecError` | The `lps` process failed outside the two cases above |
| `INVALID_CONFIRM_TOKEN` | Unknown, already-used, or wrong-tool `confirmToken` |
| `CONFIRM_TOKEN_EXPIRED` | `confirmToken` older than 5 minutes |
| `NO_PROJECT_CONFIG` | No `loopress.json` in the current directory (resource only) |

## Environment variables

| Variable | Description |
|----------|--------------|
| `LPS_BIN` | Overrides the `lps` binary invoked (default `lps` on `PATH`). Used by tests and to run against the workspace's dev build. |

## Development

```bash
pnpm install   # workspace root
pnpm dev       # runs the server with tsx against src/server.ts
pnpm build     # compiles to dist/
pnpm test      # vitest
pnpm lint
```
