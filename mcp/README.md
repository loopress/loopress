# @loopress/mcp

An MCP (Model Context Protocol) server exposing Loopress CLI operations as tool calls, so an AI
agent can pull and push snippets, pages, API routes, ACF objects, SEO settings, forms, plugins
and Composer dependencies on a WordPress site, one resource at a time or all at once, plus check
project status. Ships as the `lps-mcp` binary.

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
| `app_push` | Yes | `env?`, `name?`, `confirmToken?` | Push built single-page app bundles (`apps/<name>/dist/`) to WordPress |
| `app_pull` | No | `env?`, `path?` | Pull single-page app bundles from WordPress into local files |
| `app_list` | No | `env?` | List single-page apps currently deployed to WordPress |
| `app_remove` | Yes | `env?`, `name`, `confirmToken?` | Remove a single-page app from WordPress |
| `acf_push` | Yes | `env?`, `path?`, `type?`, `confirmToken?` | Push local ACF field groups, post types, taxonomies and options pages to WordPress |
| `acf_pull` | No | `env?`, `path?`, `type?` | Pull ACF objects from WordPress into local files |
| `acf_list` | No | `env?`, `type?` | List ACF objects currently on WordPress |
| `seo_push` | Yes | `env?`, `path?`, `confirmToken?` | Push SEO settings, post meta and redirects to WordPress |
| `seo_pull` | No | `env?`, `path?`, `postType?` | Pull SEO settings, post meta and redirects from WordPress into local files |
| `seo_list` | No | `env?`, `postType?` | List posts with SEO meta, and redirects if supported, on WordPress |
| `form_push` | Yes | `env?`, `path?`, `confirmToken?` | Push local form files to WordPress |
| `form_pull` | No | `env?`, `path?` | Pull forms from WordPress into local files |
| `form_list` | No | `env?` | List forms currently on WordPress |
| `plugin_push` | Yes | `env?`, `force?`, `prune?`, `confirmToken?` | Install/pin/activate WordPress.org plugins to match `loopress.json`, via Composer + WPackagist |
| `plugin_pull` | No | `env?` | Pull installed plugins from WordPress into `loopress.json`, pinned to their live versions |
| `plugin_status` | No | `env?` | Report drift between the plugins on WordPress and `loopress.json` |
| `plugin_audit` | No | — | Check `loopress.json` plugins for known vulnerabilities and health issues |
| `theme_push` | Yes | `env?`, `force?`, `confirmToken?` | Install/pin WordPress.org themes to match `loopress.json` (never switches the active theme) |
| `theme_pull` | No | `env?` | Pull installed themes from WordPress into `loopress.json`, pinned to their live versions |
| `theme_status` | No | `env?` | Report version drift between the themes on WordPress and `loopress.json` |
| `composer_push` | Yes | `env?`, `force?`, `confirmToken?` | Push `composer.json`/`composer.lock` and run Composer on WordPress |
| `composer_pull` | No | `env?` | Pull `composer.json`/`composer.lock` from WordPress |
| `push_all` | Yes | `env?`, `confirmToken?` | Push every local resource to WordPress in one run (`lps push`) |
| `pull_all` | No | `env?` | Pull every resource from WordPress into local files in one run (`lps pull`) |
| `project_status` | No | `env?` | Show which project and environment the other tools will target |

`env` overrides the globally active environment for that call. `path` overrides the directory
configured in `loopress.json` for that feature. `type` (ACF) and `postType` (SEO) are optional
arrays that scope the operation to specific object types, matching the CLI's `--type` and
`--post-type` flags.

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
| `TIMEOUT` | The underlying `lps` command exceeded its timeout (120s by default, 600s for `push_all`/`pull_all`, 620s for `composer_push` / `plugin_push` / `theme_push`) |
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
