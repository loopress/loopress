# @loopress/mcp

An MCP (Model Context Protocol) server exposing Loopress CLI operations as tool calls, so an AI
agent can pull and push snippets, API routes, hooks, ACF objects, forms, nav menus, custom post types, taxonomies, post meta, roles, block patterns, options, Global Styles, plugins, themes and Composer dependencies on a WordPress
site (plus push, list and diff static pages and block templates, which don't support pull, and deploy
single-page apps), one resource at a time or all at once, plus check project status. Ships as the
`lps-mcp` binary.

It does not reimplement any of that logic: every tool runs the CLI with `--json` and parses its
stdout. The CLI is an optional peer dependency: `@loopress/cli`'s `bin/run.js` is resolved next to
this package and started with the running Node (never the `lps` shim, which Windows can't spawn
without a shell), falling back to `lps` on `PATH` when it can't be resolved (pnpm, Volta, a
separate npm prefix). That fallback is looked up in absolute `PATH` entries only, never the
working directory, then run through [`tinyexec`](https://github.com/tinylibs/tinyexec), which
escapes arguments for `cmd.exe` on Windows. On timeout the whole process tree is killed.

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

On Windows, npm installs `lps-mcp` as a `.cmd` shim, so launch it through `cmd`:
`claude mcp add loopress -- cmd /c lps-mcp`, or `"command": "cmd", "args": ["/c", "lps-mcp"]` in a
JSON config.

The server communicates over stdio and takes no CLI arguments of its own.

On connect it sends the agent `instructions` (`src/instructions.ts`): what a Loopress project is, and the documentation page of each resource's file format. A test checks every link points to an existing page in `documentation/`.

## Tools

| Tool | Mutating | Args | Description |
|------|----------|------|-------------|
| `snippet_push` | Yes | `env?`, `path?`, `overwrite?`, `confirmToken?` | Push local snippet files to WordPress |
| `snippet_pull` | No | `env?`, `path?` | Pull snippets from WordPress into local files |
| `snippet_list` | No | `env?` | List snippets currently on WordPress |
| `snippet_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore snippets to the snapshot saved automatically before an earlier `snippet_push` (`list` shows what's available) |
| `api_push` | Yes | `env?`, `path?`, `prune?`, `overwrite?`, `confirmToken?` | Push local custom API route files to WordPress (`prune` also deletes server-side files not present locally) |
| `api_pull` | No | `env?`, `path?` | Pull custom API route files from WordPress |
| `api_list` | No | `env?` | List custom API route files currently on WordPress (flags each route `public`) |
| `api_rm` | Yes | `env?`, `filename`, `confirmToken?` | Remove one custom API route file from WordPress |
| `api_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore API route files to the snapshot saved automatically before an earlier `api_push` (`list` shows what's available) |
| `hook_push` | Yes | `env?`, `path?`, `prune?`, `overwrite?`, `confirmToken?` | Push local hook files to WordPress (`prune` also deletes server-side files not present locally) |
| `hook_pull` | No | `env?`, `path?` | Pull hook files from WordPress |
| `hook_list` | No | `env?` | List hook files (WordPress actions, filters, and cron jobs) currently on WordPress |
| `hook_rm` | Yes | `env?`, `filename`, `confirmToken?` | Remove one hook file (action, filter, cron) from WordPress |
| `hook_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore hook files to the snapshot saved automatically before an earlier `hook_push` (`list` shows what's available) |
| `page_push` | Yes | `env?`, `slug?`, `overwrite?`, `confirmToken?` | Push local static HTML pages (`pages/<slug>.html`) to WordPress, or only `slug` |
| `page_list` | No | `env?` | List the static pages managed by Loopress on WordPress (slug, status, URL) |
| `page_diff` | No | `env?` | Show what differs (HTML, title, status) between the local pages and WordPress |
| `template_push` | Yes | `env?`, `confirmToken?` | Push local block templates (`theme/templates/<slug>.html`), parts (`theme/parts/<slug>.html`) and theme CSS (`theme/css/`, `theme/blocks/`) as the files of the Loopress child theme |
| `template_list` | No | `env?` | Show the Loopress child theme: active or not, its templates and parts, and Site Editor edits |
| `template_diff` | No | `env?` | Show what differs between the local templates and parts and the child theme, Site Editor edits included |
| `app_push` | Yes | `env?`, `name?`, `noBuild?`, `confirmToken?` | Build (package.json `build` script) and push single-page app bundles (`apps/<name>/dist/`) to WordPress |
| `app_pull` | No | `env?`, `path?` | Pull single-page app bundles from WordPress into local files |
| `app_list` | No | `env?` | List single-page apps currently deployed to WordPress |
| `app_remove` | Yes | `env?`, `name`, `confirmToken?` | Remove a single-page app from WordPress |
| `acf_push` | Yes | `env?`, `path?`, `type?`, `overwrite?`, `confirmToken?` | Push local ACF field groups, post types, taxonomies and options pages to WordPress |
| `acf_pull` | No | `env?`, `path?`, `type?` | Pull ACF objects from WordPress into local files |
| `acf_list` | No | `env?`, `type?` | List ACF objects currently on WordPress |
| `acf_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore ACF objects to the snapshot saved automatically before an earlier `acf_push` (`list` shows what's available) |
| `menu_push` | Yes | `env?`, `path?`, `overwrite?`, `confirmToken?` | Push local nav menus and the active theme menu locations to WordPress |
| `menu_pull` | No | `env?`, `path?` | Pull nav menus and the active theme menu locations from WordPress into local files |
| `menu_list` | No | `env?` | List nav menus and the active theme menu locations currently on WordPress |
| `menu_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore nav menus and menu locations to the snapshot saved automatically before an earlier `menu_push` (`list` shows what's available) |
| `cpt_push` | Yes | `env?`, `path?`, `overwrite?`, `confirmToken?` | Push local `cpt/<slug>.json` custom post types to WordPress (create or update only) |
| `cpt_pull` | No | `env?`, `path?` | Pull the custom post types Loopress manages into `cpt/<slug>.json` files |
| `cpt_list` | No | `env?` | List the post types registered on WordPress and where each comes from |
| `cpt_rm` | Yes | `filename`, `env?`, `confirmToken?` | Stop registering a Loopress custom post type (its posts stay in the database, hidden) |
| `cpt_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore custom post types to the snapshot saved automatically before an earlier `cpt_push` (`list` shows what's available) |
| `taxonomy_push` | Yes | `env?`, `path?`, `overwrite?`, `confirmToken?` | Push local `taxonomies/<slug>.json` taxonomies to WordPress (create or update only, never their terms) |
| `taxonomy_pull` | No | `env?`, `path?` | Pull the taxonomies Loopress manages into `taxonomies/<slug>.json` files |
| `taxonomy_list` | No | `env?` | List the taxonomies registered on WordPress, where each comes from and the post types it attaches to |
| `taxonomy_rm` | Yes | `filename`, `env?`, `confirmToken?` | Stop registering a Loopress taxonomy (its terms stay in the database, hidden) |
| `taxonomy_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore taxonomies to the snapshot saved automatically before an earlier `taxonomy_push` (`list` shows what's available) |
| `meta_push` | Yes | `env?`, `path?`, `overwrite?`, `confirmToken?` | Push local `meta/<post-type>.json` meta keys to WordPress (create or update only, never their values) |
| `meta_pull` | No | `env?`, `path?` | Pull the post meta keys Loopress manages into `meta/<post-type>.json` files |
| `meta_list` | No | `env?` | List the meta keys registered for each post type on WordPress, and whether Loopress declares them |
| `meta_rm` | Yes | `filename`, `env?`, `confirmToken?` | Stop registering the Loopress meta keys of one post type (their values stay in the database) |
| `meta_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore post meta keys to the snapshot saved automatically before an earlier `meta_push` (`list` shows what's available) |
| `role_push` | Yes | `env?`, `path?`, `overwrite?`, `confirmToken?` | Push local `roles/<slug>.json` roles to WordPress (create or update only, never changes which users have them) |
| `role_pull` | No | `env?`, `path?` | Pull the roles Loopress manages into `roles/<slug>.json` files |
| `role_list` | No | `env?` | List the user roles on WordPress, where each comes from and how many users have it |
| `role_rm` | Yes | `filename`, `env?`, `confirmToken?` | Stop registering a Loopress role (its users keep it, with no capability) |
| `role_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore roles to the snapshot saved automatically before an earlier `role_push` (`list` shows what's available) |
| `pattern_push` | Yes | `env?`, `path?`, `overwrite?`, `confirmToken?` | Push local `patterns/<slug>.html` block patterns to WordPress, registered as `loopress/<slug>` (create or update only) |
| `pattern_pull` | No | `env?`, `path?` | Pull the block patterns Loopress manages into `patterns/<slug>.html` files |
| `pattern_list` | No | `env?` | List the block patterns registered by Loopress, the theme and plugins |
| `pattern_rm` | Yes | `filename`, `env?`, `confirmToken?` | Stop registering a Loopress block pattern (references to it render nothing) |
| `pattern_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore block patterns to the snapshot saved automatically before an earlier `pattern_push` (`list` shows what's available) |
| `option_push` | Yes | `env?`, `path?`, `overwrite?`, `confirmToken?` | Push locally tracked, non-readonly options to WordPress |
| `option_pull` | No | `env?`, `path?` | Refresh locally tracked options from WordPress |
| `option_list` | No | `env?`, `noCore?` | List WordPress option names and autoload flags currently on the site (names only, never values) |
| `option_add` | No | `env?`, `name` | Fetch a WordPress option by name and start tracking it locally |
| `option_remove` | Yes | `env?`, `name`, `confirmToken?` | Stop tracking an option locally and delete it from WordPress |
| `option_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore tracked options to the snapshot saved automatically before an earlier `option_push` (`list` shows what's available) |
| `form_push` | Yes | `env?`, `path?`, `overwrite?`, `confirmToken?` | Push local form files to WordPress |
| `form_pull` | No | `env?`, `path?` | Pull forms from WordPress into local files |
| `form_list` | No | `env?` | List forms currently on WordPress |
| `form_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore forms to the snapshot saved automatically before an earlier `form_push` (`list` shows what's available) |
| `plugin_add` | No | `slug`, `version?` | Add a WordPress.org plugin to `loopress.json`, or change its pinned version (local file only) |
| `plugin_push` | Yes | `env?`, `force?`, `prune?`, `activate?`, `confirmToken?` | Install WordPress.org plugins to match `loopress.json` (active state included), or push the whole `composer.json` when there is one, via Composer + WPackagist |
| `plugin_pull` | No | `env?`, `plugins?` | Refresh the tracked plugins from WordPress into `loopress.json` (or `composer.json`), pinned to their live versions; other installed plugins are reported as `untracked` unless named in `plugins` |
| `plugin_status` | No | `env?` | Compare the plugins on WordPress against `loopress.json` and report drift |
| `plugin_audit` | No | none | Check `loopress.json` plugins for known vulnerabilities and health issues |
| `theme_add` | No | `slug`, `version?` | Add a WordPress.org theme to `loopress.json`, or change its pinned version (local file only) |
| `theme_version_push` | Yes | `env?`, `force?`, `confirmToken?` | Install WordPress.org themes to match `loopress.json` (never switches the active theme) |
| `theme_push` | Yes | `env?`, `force?`, `confirmToken?` | Push everything theme related: versions, then templates and parts, then Global Styles |
| `theme_version_pull` | No | `env?` | Pull installed themes from WordPress into `loopress.json`, pinned to their live versions |
| `theme_pull` | No | `env?` | Pull everything theme related: versions, then Global Styles |
| `theme_status` | No | `env?` | Compare the themes on WordPress against `loopress.json` and report version drift |
| `theme_styles_push` | Yes | `env?`, `path?`, `overwrite?`, `confirmToken?` | Push the local Global Styles file to the active block theme's Site Editor > Styles on WordPress |
| `theme_styles_pull` | No | `env?`, `path?` | Pull the active block theme's Global Styles customizations from WordPress into a local file |
| `theme_styles_rollback` | Yes | `env?`, `path?`, `list?`, `to?`, `confirmToken?` | Restore Global Styles to the snapshot saved automatically before an earlier `theme_styles_push` (`list` shows what's available) |
| `composer_push` | Yes | `env?`, `force?`, `confirmToken?` | Push `composer.json` and run Composer on WordPress to resolve and install dependencies |
| `composer_pull` | No | `env?` | Pull `composer.json`/`composer.lock` from WordPress |
| `push_all` | Yes | `env?`, `overwrite?`, `confirmToken?` | Push every local resource to WordPress in one run (`lps push`) |
| `pull_all` | No | `env?` | Pull every resource from WordPress into local files in one run (`lps pull`) |
| `project_promote` | Yes | `from`, `to`, `overwrite?`, `confirmToken?` | Copy every tracked resource from one environment to another, pulling from `from` then pushing to `to` (`lps promote`) |
| `content_copy` | Yes | `from`, `confirmToken?` | Replace the local site's posts, pages and terms with `from`'s, then push the project to local (`lps content copy`) |
| `project_status` | No | `env?` | Show which project and environment the other tools will target |
| `project_diff` | No | `env?`, `against?`, `only?`, `skip?` | Show what differs between local tracked files and a WordPress environment, or between two environments |
| `project_doctor` | No | `env?` | Diagnose connectivity, plugin, credential and hook problems for the targeted environment |
| `validate_local` | No | none | Check local tracked files are well formed and push-ready, without contacting WordPress |

`env` picks the environment for that call, instead of the project's default (`local`, or its only one). `path` overrides the directory
configured in `loopress.json` for that feature. `type` (ACF) is an optional
array that scopes the operation to specific object types, matching the CLI's `--type` flag. `project_diff`'s `only`/`skip` are optional arrays of resource names
(`snippet`, `form`, `acf`, `api`, `hook`, `template`, `part`, `page`, `menu`, `cpt`, `taxonomy`, `meta`, `role`, `pattern`, `option`,
`theme-styles`, `composer`) and `against`
compares two environments instead of an environment against local files. Each `_rollback` tool
restores the snapshot its resource's `_push` tool saved automatically right before the last real
push; `list: true` shows what's available (id, timestamp, environment) instead of rolling back,
and `to` picks an older snapshot than the most recent one.

## Confirmation handshake

Every mutating tool (anything that reaches a real WordPress site) requires two calls:

1. **Call without `confirmToken`**: runs `lps ... --dry-run`, returns the preview plus a
   single-use `confirmToken` (UUID, expires after 5 minutes, capped at 100 pending tokens
   process-wide). Most push previews list each item they write under `changes`, as created,
   changed or unchanged against the site (not the plugin, theme version, composer and app
   pushes, whose previews have their own shape).
2. **Call again with that `confirmToken`**: re-runs that same `--dry-run` once more against the
   frozen copy taken at preview time; if it reports anything different from the original preview
   (e.g. a rollback's `drift` field has changed because something else touched the environment
   since), the call is refused (`STALE_PREVIEW`) instead of applying against stale data, call
   again without `confirmToken` for a fresh preview. Otherwise it runs the real command, using the
   args and local files captured at preview time, not whatever the second call resends or whatever
   is on disk by then, so those two inputs can never drift from what was previewed.

Mutating tools never touch an environment named `production` (`PRODUCTION_BLOCKED`): run those
changes with `lps`, where they are confirmed interactively. When `env` is omitted, the preview call
first resolves the default environment (`lps status`) and pins it as `--env <name>`, so the
production refusal also covers an implicit target, and the confirmed call applies to the
environment that was previewed even if the configuration changes in between.

There is no way to skip the preview and apply in one call: no tool schema exposes a flag for it. One residual gap: the revalidation dry-run and
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
| `TIMEOUT` | The underlying `lps` command exceeded its timeout (120s by default, 600s for `push_all`/`pull_all`, 620s for `composer_push` / `plugin_push` / `theme_push` / `theme_version_push`) |
| `ExecError` | The `lps` process failed outside the two cases above |
| `INVALID_CONFIRM_TOKEN` | Unknown, already-used, or wrong-tool `confirmToken` |
| `CONFIRM_TOKEN_EXPIRED` | `confirmToken` older than 5 minutes |
| `STALE_PREVIEW` | The environment changed since the preview; call again without `confirmToken` for a fresh one |
| `PRODUCTION_BLOCKED` | The call targets the `production` environment, explicitly or as the default one; run it with `lps` instead |
| `UNRESOLVED_ENVIRONMENT` | `env` was omitted and the project has no default environment (no `local`, several others); pass `env` |
| `NO_PROJECT_CONFIG` | No `loopress.json` in the current directory (resource only) |

## Environment variables

| Variable | Description |
|----------|--------------|
| `LPS_BIN` | Overrides the CLI invoked (default: the installed `@loopress/cli`, else `lps` on `PATH`). A `.js`/`.mjs`/`.cjs` path (e.g. `cli/bin/dev.js`) runs under the current Node, anything else is spawned as is. |

## Development

```bash
pnpm install   # workspace root
pnpm dev       # runs the server with tsx against src/server.ts
pnpm build     # compiles to dist/
pnpm test      # vitest
pnpm lint
```
