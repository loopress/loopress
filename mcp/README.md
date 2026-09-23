# @loopress/mcp

An MCP (Model Context Protocol) server exposing Loopress CLI operations as tool calls, so an AI
agent can pull and push snippets, API routes, hooks, ACF objects, SEO settings, forms, nav menus,
plugins and Composer dependencies on a WordPress site (plus push, list and diff static pages, which
don't support pull), one resource at a time or all at once, plus check project status. Ships as the
`lps-mcp` binary.

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
| `snippet_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore snippets to the snapshot saved automatically before an earlier `snippet_push` (`list` shows what's available) |
| `api_push` | Yes | `env?`, `path?`, `prune?`, `confirmToken?` | Push local custom API route files to WordPress (`prune` also deletes server-side files not present locally) |
| `api_pull` | No | `env?`, `path?` | Pull custom API route files from WordPress |
| `api_list` | No | `env?` | List custom API route files currently on WordPress (flags each route `public`) |
| `api_rm` | Yes | `env?`, `filename`, `confirmToken?` | Remove one custom API route file from WordPress |
| `api_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore API route files to the snapshot saved automatically before an earlier `api_push` (`list` shows what's available) |
| `hook_push` | Yes | `env?`, `path?`, `prune?`, `confirmToken?` | Push local hook files to WordPress (`prune` also deletes server-side files not present locally) |
| `hook_pull` | No | `env?`, `path?` | Pull hook files from WordPress |
| `hook_list` | No | `env?` | List hook files (WordPress actions, filters, and cron jobs) currently on WordPress |
| `hook_rm` | Yes | `env?`, `filename`, `confirmToken?` | Remove one hook file (action, filter, cron) from WordPress |
| `hook_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore hook files to the snapshot saved automatically before an earlier `hook_push` (`list` shows what's available) |
| `page_push` | Yes | `env?`, `slug?`, `confirmToken?` | Push local static HTML pages (`pages/<slug>.html`) to WordPress, or only `slug` |
| `page_list` | No | `env?` | List the static pages managed by Loopress on WordPress (slug, status, URL) |
| `page_diff` | No | `env?` | Show what differs (HTML, title, status) between the local pages and WordPress |
| `app_push` | Yes | `env?`, `name?`, `confirmToken?` | Push built single-page app bundles (`apps/<name>/dist/`) to WordPress |
| `app_pull` | No | `env?`, `path?` | Pull single-page app bundles from WordPress into local files |
| `app_list` | No | `env?` | List single-page apps currently deployed to WordPress |
| `app_remove` | Yes | `env?`, `name`, `confirmToken?` | Remove a single-page app from WordPress |
| `acf_push` | Yes | `env?`, `path?`, `type?`, `confirmToken?` | Push local ACF field groups, post types, taxonomies and options pages to WordPress |
| `acf_pull` | No | `env?`, `path?`, `type?` | Pull ACF objects from WordPress into local files |
| `acf_list` | No | `env?`, `type?` | List ACF objects currently on WordPress |
| `acf_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore ACF objects to the snapshot saved automatically before an earlier `acf_push` (`list` shows what's available) |
| `seo_push` | Yes | `env?`, `path?`, `allowExternalRedirects?`, `confirmToken?` | Push SEO settings, post meta and redirects to WordPress |
| `seo_pull` | No | `env?`, `path?`, `postType?` | Pull SEO settings, post meta and redirects from WordPress into local files |
| `seo_list` | No | `env?`, `postType?` | List posts with SEO meta, and redirects if supported, on WordPress |
| `seo_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore SEO settings, post meta and redirects to the snapshot saved automatically before an earlier `seo_push` (`list` shows what's available) |
| `menu_push` | Yes | `env?`, `path?`, `confirmToken?` | Push local nav menus and the active theme menu locations to WordPress |
| `menu_pull` | No | `env?`, `path?` | Pull nav menus and the active theme menu locations from WordPress into local files |
| `menu_list` | No | `env?` | List nav menus and the active theme menu locations currently on WordPress |
| `menu_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore nav menus and menu locations to the snapshot saved automatically before an earlier `menu_push` (`list` shows what's available) |
| `option_push` | Yes | `env?`, `path?`, `confirmToken?` | Push locally tracked, non-readonly options to WordPress |
| `option_pull` | No | `env?`, `path?` | Refresh locally tracked options from WordPress |
| `option_list` | No | `env?`, `noCore?` | List WordPress option names and autoload flags currently on the site (names only, never values) |
| `option_add` | No | `env?`, `name` | Fetch a WordPress option by name and start tracking it locally |
| `option_remove` | Yes | `env?`, `name`, `confirmToken?` | Stop tracking an option locally and delete it from WordPress |
| `option_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore tracked options to the snapshot saved automatically before an earlier `option_push` (`list` shows what's available) |
| `form_push` | Yes | `env?`, `path?`, `confirmToken?` | Push local form files to WordPress |
| `form_pull` | No | `env?`, `path?` | Pull forms from WordPress into local files |
| `form_list` | No | `env?` | List forms currently on WordPress |
| `form_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore forms to the snapshot saved automatically before an earlier `form_push` (`list` shows what's available) |
| `plugin_push` | Yes | `env?`, `force?`, `prune?`, `confirmToken?` | Install/pin/activate WordPress.org plugins to match `loopress.json`, via Composer + WPackagist |
| `plugin_pull` | No | `env?` | Pull installed plugins from WordPress into `loopress.json`, pinned to their live versions |
| `plugin_status` | No | `env?` | Report drift between the plugins on WordPress and `loopress.json` |
| `plugin_audit` | No | — | Check `loopress.json` plugins for known vulnerabilities and health issues |
| `theme_push` | Yes | `env?`, `force?`, `confirmToken?` | Install/pin WordPress.org themes to match `loopress.json` (never switches the active theme) |
| `theme_pull` | No | `env?` | Pull installed themes from WordPress into `loopress.json`, pinned to their live versions |
| `theme_status` | No | `env?` | Report version drift between the themes on WordPress and `loopress.json` |
| `theme_styles_push` | Yes | `env?`, `path?`, `confirmToken?` | Push the local Global Styles file to the active block theme's Site Editor > Styles on WordPress |
| `theme_styles_pull` | No | `env?`, `path?` | Pull the active block theme's Global Styles customizations from WordPress into a local file |
| `theme_styles_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore Global Styles to the snapshot saved automatically before an earlier `theme_styles_push` (`list` shows what's available) |
| `composer_push` | Yes | `env?`, `force?`, `confirmToken?` | Push `composer.json` and run Composer on WordPress to resolve and install dependencies |
| `composer_pull` | No | `env?` | Pull `composer.json`/`composer.lock` from WordPress |
| `push_all` | Yes | `env?`, `confirmToken?` | Push every local resource to WordPress in one run (`lps push`) |
| `pull_all` | No | `env?` | Pull every resource from WordPress into local files in one run (`lps pull`) |
| `project_promote` | Yes | `from`, `to`, `confirmToken?` | Copy every tracked resource from one environment to another, pulling from `from` then pushing to `to` (`lps promote`) |
| `project_status` | No | `env?` | Show which project and environment the other tools will target |
| `project_diff` | No | `env?`, `against?`, `only?`, `skip?` | Show what differs between local tracked files and a WordPress environment, or between two environments |
| `project_doctor` | No | `env?` | Diagnose connectivity, plugin and credential problems for the targeted environment |
| `validate_local` | No | — | Check local tracked files are well formed and push-ready, without contacting WordPress |

`env` overrides the globally active environment for that call. `path` overrides the directory
configured in `loopress.json` for that feature. `type` (ACF) and `postType` (SEO) are optional
arrays that scope the operation to specific object types, matching the CLI's `--type` and
`--post-type` flags. `project_diff`'s `only`/`skip` are optional arrays of resource names
(`snippet`, `form`, `acf`, `api`, `hook`, `seo`, `menu`, `option`, `theme-styles`, `composer`) and `against`
compares two environments instead of an environment against local files. Each `_rollback` tool
restores the snapshot its resource's `_push` tool saved automatically right before the last real
push; `list: true` shows what's available (id, timestamp, environment) instead of rolling back,
and `to` picks an older snapshot than the most recent one.

## Confirmation handshake

Every mutating tool (anything that reaches a real WordPress site) requires two calls:

1. **Call without `confirmToken`**: runs `lps ... --dry-run`, returns the preview plus a
   single-use `confirmToken` (UUID, expires after 5 minutes, capped at 100 pending tokens
   process-wide).
2. **Call again with that `confirmToken`**: re-runs that same `--dry-run` once more against the
   frozen copy taken at preview time; if it reports anything different from the original preview
   (e.g. a rollback's `drift` field has changed because something else touched the environment
   since), the call is refused (`STALE_PREVIEW`) instead of applying against stale data, call
   again without `confirmToken` for a fresh preview. Otherwise it runs the real command, using the
   args and local files captured at preview time, not whatever the second call resends or whatever
   is on disk by then, so those two inputs can never drift from what was previewed.

There is no way to skip the preview and apply in one call, including against a `production`
environment: no tool schema exposes a flag for it. One residual gap: the revalidation dry-run and
the real apply are still two separate requests, not one atomic check-and-write, so a WordPress
change landing in that narrow window between them (rather than during the, typically much longer,
preview-to-confirm window the revalidation above guards) can still be overwritten. Closing that
fully needs a conditional write (an ETag/revision precondition on the underlying PUT/POST, enforced
by WordPress itself), a materially larger change to the CLI's own HTTP client shared by every
resource push, tracked separately (loopress#234).

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
| `STALE_PREVIEW` | The environment changed since the preview; call again without `confirmToken` for a fresh one |
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
