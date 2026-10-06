---
title: Multi-Environment Workflow
description: Push, pull and compare every tracked resource at once, promote one environment to another, and watch files during local development.
---

Each feature has its own `pull`/`push`/`diff` commands. The commands on this page run them all at once, across every resource your project tracks.

| Command | What it does |
|---------|--------------|
| [`lps status`](#lps-status) | Show which project and environment commands will target |
| [`lps pull`](#lps-pull) | Pull every resource from WordPress |
| [`lps push`](#lps-push) | Push every resource to WordPress |
| [`lps diff`](#lps-diff) | Compare local files with an environment, or two environments |
| [`lps promote`](#lps-promote) | Copy every tracked resource from one environment to another |
| [`lps validate`](#lps-validate) | Check local files are push-ready, without contacting WordPress |
| [`lps dev`](#lps-dev) | Watch files and push each change to the `local` environment |

All of them accept the [common flags](/concepts/#common-flags) where they apply.

## What each command covers

Not every resource takes part in every aggregate command:

| Resource | `lps pull` | `lps push` | `lps diff` | `lps dev` |
|----------|:---:|:---:|:---:|:---:|
| [Plugins](/plugins/) | ✓ | ✓ | `lps plugin status` | ✓ |
| [Composer](/composer/cli/) | ✓ | ✓ | ✓ | |
| [ACF](/acf/) | ✓ | ✓ | ✓ | |
| [API routes](/api/cli/) | ✓ | ✓ | ✓ | ✓ |
| [Hooks](/hooks/) | ✓ | ✓ | ✓ | ✓ |
| [Forms](/forms/) | ✓ | ✓ | ✓ | |
| [Templates and parts](/pages/#templates-and-parts) | no pull | ✓ | ✓ | ✓ |
| [Static pages](/pages/) | no pull | ✓ | ✓ | ✓ |
| [SEO](/seo/) | ✓ | ✓ | ✓ | |
| [Menus](/menus/) | ✓ | ✓ | ✓ | |
| [Options](/options/) | ✓ | ✓ | ✓ | |
| [Snippets](/snippets/) | ✓ | ✓ | ✓ | ✓ |
| [Theme Styles](/theme-styles/) | | | ✓ | |
| [Themes](/themes/) | | | `lps theme status` | |
| [Single-Page Apps](/apps/) | | | | |

Theme versions and Global Styles are left out of `lps push` and `lps pull` so a run doesn't break on a classic theme: use [`lps theme push` / `lps theme pull`](/themes/#commands). Apps are pushed with [`lps app push`](/apps/cli/#lps-app-push).

## `lps status`

Show which project, environment and URL the next command will target, resolved the same way every command does (`--env`, then `loopress.json`'s `projectId`, then the active project), plus the CLI's config and data directories.

```bash
lps status
lps status --env staging
```

With `--json`, the result includes an `environment` field: the name of the environment that resolved, absent when none does (no project configured, or a project with several environments and none active).

## `lps pull`

Pull every resource from WordPress into local files, in one run.

```bash
lps pull
lps pull --env staging
lps pull --dry-run
```

Composer runs before plugins, so that with a `composer.json` the live plugin versions are merged into the freshly pulled file. A failing resource doesn't stop the others: the command reports each one, then exits non-zero with every failure's reason.

## `lps push`

Push every resource to WordPress, in dependency order: plugins and Composer first, then ACF, API routes, hooks, forms, templates and parts, pages, SEO, menus, options, and snippets last.

```bash
lps push
lps push --env staging --yes
lps push --dry-run
```

When the repository has a `composer.json` that declares plugins, `plugin push` already pushes it whole, so `composer push` is skipped and Composer runs only once on the server. Like `lps pull`, a failing resource doesn't stop the others.

## `lps diff`

Show what differs between your local tracked files and a WordPress environment, or between two environments.

```bash
lps diff
lps diff --env staging
lps diff --env staging --against production
lps diff --only snippet --only acf
lps diff --skip composer
```

| Flag | Description |
|------|-------------|
| `--against <env>` | Compare the target environment with this second environment instead of local files |
| `--only <resource>` | Only compare these resources. Repeatable |
| `--skip <resource>` | Compare every resource except these. Repeatable |

Resource names: `snippet`, `form`, `acf`, `api`, `hook`, `page`, `template`, `part`, `seo`, `menu`, `option`, `theme-styles`, `composer`.

The exit code makes it a CI drift gate: `0` in sync, `1` on drift, `2` when a resource could not be compared. Every feature also has its own `diff` subcommand (`lps snippet diff`, `lps acf diff`, ...) with the same `--against` flag and exit codes.

## `lps promote`

Copy every tracked resource from one environment to another: `lps pull` from the source, then `lps push` to the target.

```bash
lps promote staging production
lps promote production staging --dry-run
```

A real promotion **overwrites your local tracked files** with the source environment's, so it always asks for confirmation (`--yes` in CI), whatever the target's name. If the pull fails, nothing is pushed.

With `--dry-run`, the source is pulled into a throwaway copy of the project and the push is only previewed from there: the preview shows what a real promotion would push, and your own files stay untouched. It refuses to run when `loopress.json` points a directory outside the project, use `lps diff --env <from> --against <to>` instead.

## `lps validate`

Check that local tracked files are well formed and push-ready, without contacting WordPress. Exits `1` when it finds a problem, so it fits a pre-commit hook or the first step of a CI job.

```bash
lps validate
```

## `lps dev`

Watch project files and push each change to the `local` environment as soon as you save it.

```bash
lps dev
lps dev --only=snippets,api
lps dev --skip=plugins
```

| Flag | Description |
|------|-------------|
| `--only <types>` | Only watch these resource types, comma-separated |
| `--skip <types>` | Skip these resource types, comma-separated |

Watched types: `snippets`, `templates`, `parts`, `pages`, `api`, `hooks`, `plugins`.

`lps dev` always targets the environment named `local`, never any other: add one with `lps project config` first. To push to another environment, run the feature's `push` command with `--env`.
