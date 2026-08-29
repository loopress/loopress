---
title: MCP Server
description: Connect an AI agent to your WordPress site with the Loopress MCP server.
---

`@loopress/mcp` is an [MCP](https://modelcontextprotocol.io/) server that exposes Loopress CLI operations as tool calls, so an AI agent (Claude Code, Claude Desktop, or any MCP client) can pull and push snippets, pages, API routes, ACF objects, SEO settings, forms, plugins and Composer dependencies on a WordPress site, one resource at a time or all at once, and check project status. It ships as the `lps-mcp` binary.

It doesn't reimplement any sync logic: every tool shells out to the `lps` binary already on your `PATH`, the same one used by the [CLI](/cli/).

## Requirements

- [The Loopress CLI](/cli/getting-started/) installed and on `PATH`
- A `loopress.json` already set up in the directory your MCP client will launch the server from (`lps init`), since tools resolve paths the same way `lps` does when run by hand
- WordPress authentication already done via the CLI (`lps project config`). The MCP server never handles auth itself, it only calls `lps`, which reads the stored Application Password.

## Installation

```bash
npm install -g @loopress/mcp
```

Then point your MCP client at the `lps-mcp` binary. In Claude Code:

```bash
claude mcp add loopress -- lps-mcp
```

In a JSON-based client config (Claude Desktop and similar):

```json
{
  "mcpServers": {
    "loopress": {
      "command": "lps-mcp"
    }
  }
}
```

The server communicates over stdio from the directory your client launches it in, and takes no arguments of its own.

## Tools

| Tool | Mutating | Description |
|------|----------|-------------|
| `snippet_push` | Yes | Push local snippet files to WordPress |
| `snippet_pull` | No | Pull snippets from WordPress into local files |
| `snippet_list` | No | List snippets currently on WordPress |
| `page_push` | Yes | Push local page files to WordPress |
| `page_pull` | No | Pull pages from WordPress into local files |
| `page_list` | No | List pages currently on WordPress |
| `api_push` | Yes | Push local custom API route files to WordPress |
| `api_pull` | No | Pull custom API route files from WordPress |
| `api_list` | No | List custom API route files currently on WordPress |
| `acf_push` | Yes | Push local ACF field groups, post types, taxonomies and options pages to WordPress |
| `acf_pull` | No | Pull ACF objects from WordPress into local files |
| `acf_list` | No | List ACF objects currently on WordPress |
| `seo_push` | Yes | Push SEO settings, post meta and redirects to WordPress |
| `seo_pull` | No | Pull SEO settings, post meta and redirects from WordPress into local files |
| `seo_list` | No | List posts with SEO meta, and redirects if supported, on WordPress |
| `form_push` | Yes | Push local form files to WordPress |
| `form_pull` | No | Pull forms from WordPress into local files |
| `form_list` | No | List forms currently on WordPress |
| `plugin_push` | Yes | Install/activate WordPress.org plugins to match `loopress.json` |
| `plugin_pull` | No | Pull installed plugins from WordPress into `loopress.json` |
| `composer_push` | Yes | Push `composer.json`/`composer.lock` and run `composer install` on WordPress |
| `composer_pull` | No | Pull `composer.json`/`composer.lock` from WordPress |
| `push_all` | Yes | Push every local resource to WordPress in one run, like `lps push` |
| `pull_all` | No | Pull every resource from WordPress into local files in one run, like `lps pull` |
| `project_status` | No | Show which project and environment the other tools will target |

Every tool accepts an optional `env` to target a specific environment instead of the globally active one. The `_push`, `_pull` and `_list` tools that sync files also accept an optional `path` to override the directory configured in `loopress.json`. The ACF tools take an optional `type` array and the SEO tools an optional `postType` array to scope the operation, mirroring the CLI's `--type` and `--post-type` flags.

## Confirming changes

Every mutating tool requires two calls before it touches WordPress:

1. **Call without `confirmToken`**: runs a dry-run preview and returns a single-use `confirmToken` (expires after 5 minutes) instead of making any change.
2. **Call again with that `confirmToken`**: applies exactly what was previewed.

This handshake can't be skipped, not even against a `production` environment, so an agent can never push a real change without a human-reviewable preview first.

## Project config resource

The server also exposes `loopress://project/config` as a resource: the raw contents of `loopress.json` in the current directory, for an agent to inspect without shelling out itself.
