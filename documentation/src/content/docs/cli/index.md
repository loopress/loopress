---
title: CLI Commands
description: Every Loopress CLI command, grouped by topic, with a link to its full documentation.
---

The Loopress CLI (`lps`) is a Node.js command-line tool. It connects to the WordPress REST API exposed by the [Loopress plugin](/wordpress-plugin/) and syncs your site's code and configuration with local files you commit to Git. To install it, see [Getting Started](/getting-started/). The rules shared by every command (`--env`, `--dry-run`, `--yes`, `--json`, how pull and push treat your files) are on the [Concepts](/concepts/) page.

Run `lps <command> --help` for the exact arguments and flags of any command.

## Setup and diagnostics

| Command | Description |
|---------|-------------|
| [`lps init`](/cli/init/) | Create a `loopress.json` config file interactively |
| [`lps status`](/workflow/#lps-status) | Show which project and environment commands will target |
| [`lps doctor`](/cli/doctor/) | Diagnose connectivity, plugin and credential problems |
| [`lps validate`](/workflow/#lps-validate) | Check local tracked files are push-ready, without contacting WordPress |
| [`lps telemetry enable` / `disable`](/concepts/#error-reporting) | Turn crash reporting to Sentry on or off |

## Projects and environments

| Command | Description |
|---------|-------------|
| [`lps project config`](/concepts/#configuring-an-environment) | Add or update a WordPress project environment |
| [`lps project list`](/concepts/#projects-and-environments) | List configured WordPress projects |
| [`lps project switch`](/concepts/#targeting-an-environment) | Switch the active project |
| [`lps project remove`](/concepts/#projects-and-environments) | Remove one or more WordPress projects or environments |
| [`lps project rotate`](/concepts/#projects-and-environments) | Rotate the WordPress Application Password of an environment |

## Every resource at once

| Command | Description |
|---------|-------------|
| [`lps pull`](/workflow/#lps-pull) | Pull every resource from WordPress |
| [`lps push`](/workflow/#lps-push) | Push every resource to WordPress |
| [`lps diff`](/workflow/#lps-diff) | Compare local files with an environment, or two environments. Exits 1 on drift |
| [`lps promote`](/workflow/#lps-promote) | Copy every tracked resource from one environment to another |
| [`lps dev`](/workflow/#lps-dev) | Watch files and push each change to the `local` environment |

## Features

Each feature syncs one kind of WordPress data as files. Most share the same subcommands: `pull`, `push`, `list`, `diff`, and [`rollback`](/rollback/).

| Command group | Subcommands | Feature |
|---------------|-------------|---------|
| `lps snippet` | `pull` `push` `list` `diff` `rollback` `publish` | [Snippets](/snippets/) |
| `lps hook` | `pull` `push` `list` `diff` `rollback` `remove` | [Hooks](/hooks/) |
| `lps api` | `pull` `push` `list` `diff` `rollback` `remove` `publish` | [Custom API Routes](/api/cli/) |
| `lps app` | `pull` `push` `list` `remove` | [Single-Page Apps](/apps/cli/) |
| `lps page` | `push` `list` `diff` | [Static Pages](/pages/) |
| `lps acf` | `pull` `push` `list` `diff` `rollback` | [ACF](/acf/) |
| `lps seo` | `pull` `push` `list` `diff` `rollback` | [SEO](/seo/) |
| `lps form` | `pull` `push` `list` `diff` `rollback` | [Forms](/forms/) |
| `lps menu` | `pull` `push` `list` `diff` `rollback` | [Menus](/menus/) |
| `lps option` | `add` `pull` `push` `list` `diff` `rollback` `remove` | [Options](/options/) |
| `lps plugin` | `add` `pull` `push` `status` `audit` | [Plugins](/plugins/) |
| `lps theme` | `add` `pull` `push` `status`, `version pull/push` | [Themes](/themes/) |
| `lps theme style` | `pull` `push` `diff` `rollback` | [Theme Styles](/theme-styles/) |
| `lps theme template` | `push` `list` `diff` | [Templates and parts](/pages/#templates-and-parts) |
| `lps composer` | `init` `pull` `push` | [Composer](/composer/cli/) |

`lps api remove` and `lps hook remove` are aliases of `lps api rm` and `lps hook rm`, which keep working.

## Loopress account

| Command | Description |
|---------|-------------|
| [`lps login` / `logout`](/account/#log-in) | Log in to or out of the Loopress console |
| [`lps project push`](/account/#share-projects-between-machines) | Push local projects, environments and credentials to your Loopress account |
| [`lps project pull`](/account/#share-projects-between-machines) | Pull projects and environments from your account that aren't configured locally yet |

Connecting an AI agent instead of a human? The [MCP server](/cli/mcp/) exposes these commands as tool calls.
