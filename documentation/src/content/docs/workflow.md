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
| [`lps content copy`](#lps-content-copy) | Replace the local site's content with an environment's |
| [`lps validate`](#lps-validate) | Check local files are push-ready, without contacting WordPress |
| [`lps dev`](#lps-dev) | Watch files and push each change to the `local` environment |

All of them accept the [common flags](/concepts/#common-flags) where they apply.

## What each command covers

Not every resource takes part in every aggregate command:

| Resource | `lps pull` | `lps push` | `lps diff` | `lps dev` |
|----------|:---:|:---:|:---:|:---:|
| [Plugins](/plugins/) | ✓ | ✓ | `lps plugin status` | ✓ |
| [Composer](/composer/cli/) | ✓ | ✓ | ✓ | |
| [Custom post types](/custom-post-types/) | ✓ | ✓ | ✓ | |
| [Taxonomies](/taxonomies/) | ✓ | ✓ | ✓ | |
| [Post meta](/post-meta/) | ✓ | ✓ | ✓ | |
| [Roles](/roles/) | ✓ | ✓ | ✓ | |
| [ACF](/acf/) | ✓ | ✓ | ✓ | |
| [API routes](/api/cli/) | ✓ | ✓ | ✓ | ✓ |
| [Hooks](/hooks/) | ✓ | ✓ | ✓ | ✓ |
| [Forms](/forms/) | ✓ | ✓ | ✓ | |
| [Block patterns](/block-patterns/) | ✓ | ✓ | ✓ | |
| [Templates and parts](/pages/#templates-and-parts) | no pull | ✓ | ✓ | ✓ |
| [Theme CSS](/pages/#theme-css) | no pull | ✓ | | ✓ |
| [Static pages](/pages/) | no pull | ✓ | ✓ | ✓ |
| [Menus](/menus/) | ✓ | ✓ | ✓ | |
| [Options](/options/) | ✓ | ✓ | ✓ | |
| [Snippets](/snippets/) | ✓ | ✓ | ✓ | ✓ |
| [Theme Styles](/theme-styles/) | ✓ | ✓ | ✓ | |
| [Themes](/themes/) | | | `lps theme status` | |
| [Single-Page Apps](/apps/) | | | | |

Global Styles take part only once the project tracks them (a `*-global-styles.json` file, see [Theme Styles](/theme-styles/)) and only when the site's active theme is a block theme. Otherwise they're skipped with a one-line note, so a run never breaks on a classic theme. `lps push` also needs the file of the active theme itself. Theme versions stay out of `lps push` and `lps pull`: installing or removing themes is [`lps theme push` / `lps theme pull`](/themes/#commands)'s call. Apps are pushed with [`lps app push`](/apps/cli/#lps-app-push).

## `lps status`

Show which project, environment and URL the next command will target, resolved the same way every command does (`--env`, then `loopress.json`'s `projectId`, then the active project), plus the CLI's config and data directories.

```bash
lps status
lps status --env staging
```

With `--json`, the result includes an `environment` field: the name of the environment that resolved, absent when none does (no project configured, or a project with several environments and none named `local`).

## `lps pull`

Pull every resource from WordPress into local files, in one run.

```bash
lps pull
lps pull --env staging
lps pull --dry-run
```

Composer runs before plugins, so that with a `composer.json` the live plugin versions are merged into the freshly pulled file. ACF, forms and snippets are skipped, not failed, when the site lacks their plugin and the project has no directory for them. A failing resource doesn't stop the others: the command reports each one, then exits non-zero with every failure's reason.

## `lps push`

Push every resource to WordPress, in dependency order: plugins and Composer first, then post types, taxonomies, post meta and roles (before ACF, whose location rules can target them), ACF, API routes, hooks, forms, block patterns, templates and parts, Global Styles, pages, menus, options, and snippets last.

```bash
lps push
lps push --env staging --yes
lps push --dry-run
```

When the repository has a `composer.json` that declares plugins, `plugin push` already pushes it whole, so `composer push` is skipped and Composer runs only once on the server.

Unlike `lps pull`, the push stops at the first resource that fails and lists the ones it didn't attempt: later resources depend on earlier ones (hooks use the packages Composer installs, pages need their templates), so pushing them anyway could leave the site half working. Fix the failure and run `lps push` again, resources already pushed are simply written again unchanged. Plugins and Composer are skipped, not failed, when the project doesn't manage them (no `plugins` in `loopress.json`, no `composer.json`). So are ACF, forms and snippets when the project has no directory for them (`acf/`, `forms/`, `snippets/`), on a real push and on `--dry-run` alike: a site without a form plugin no longer fails the preview. When the project does use one of them and the site can't hold it (ACF inactive, no form or snippet plugin, snippets on Loopress Light), the push refuses before pushing anything, and says which plugin to declare or activate.

`--overwrite` is passed on to every resource, see [changes made outside Loopress](/concepts/#changes-made-outside-loopress).

Like every push, it never deletes what you don't have locally unless asked ([push never deletes by default](/concepts/#push-never-deletes-by-default)), asks for confirmation when the target is named `production` (`--yes` in CI), and saves snapshots that [`rollback`](/rollback/) can restore, for the resources that support it. Run `lps diff` or `lps push --dry-run` first to see what will change.

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

Resource names: `snippet`, `form`, `acf`, `api`, `hook`, `page`, `template`, `part`, `menu`, `cpt`, `taxonomy`, `meta`, `role`, `pattern`, `option`, `theme-styles`, `composer`.

The exit code makes it a CI drift gate: `0` in sync, `1` on drift, `2` when a resource could not be compared. A resource the project doesn't use (no `acf/`, `forms/` or `snippets/` directory, no Global Styles file) is reported as skipped, not as a failure, when the site lacks its plugin or runs a classic theme. Every feature also has its own `diff` subcommand (`lps snippet diff`, `lps acf diff`, ...) with the same `--against` flag and exit codes.

## `lps promote`

Copy every tracked resource from one environment to another: `lps pull` from the source, then `lps push` to the target.

```bash
lps promote staging production
lps promote production staging --dry-run
```

A real promotion **overwrites your local tracked files** with the source environment's, so it always asks for confirmation (`--yes` in CI), whatever the target's name. If the pull fails, nothing is pushed. Changes made on the target outside Loopress stop the push the same way they stop `lps push`: pass `--overwrite` to promote anyway. To undo a promotion, run the [`rollback`](/rollback/) of each resource that has one, with `--env` set to the target.

With `--dry-run`, the source is pulled into a throwaway copy of the project and the push is only previewed from there: the preview shows what a real promotion would push, and your own files stay untouched. It refuses to run when `loopress.json` points a directory outside the project, use `lps diff --env <from> --against <to>` instead.

## `lps content copy`

Code goes up, content comes down. Your configuration is versioned and pushed from local to production, while posts, pages and terms belong to production. `lps content copy` copies them into your local site so you can work on templates against real content:

```bash
lps content copy production
lps content copy staging --dry-run
```

It is not a `pull`: nothing is written to your project files. It replaces the posts of every public post type (posts, pages, products, ...) and the terms of every public taxonomy on the `local` environment, always the target, with the source's, IDs unchanged, activates locally the theme and plugins active on the source, then runs `lps push` to the local site so your tracked configuration (menus, ACF, snippets, templates...) wins over the source's. The local content is **deleted** first, so it asks for confirmation (`--yes` to skip it).

- Theme and plugins are only activated, never installed. One active on the source but missing locally is reported, declare it in `composer.json`. When the source runs the Loopress child theme, its parent is activated first and the child once the push has written it.
- Media are not downloaded: an image missing locally is served from the source site's uploads URL. Files you upload locally keep their local URL.
- A local row whose ID is also used by an incoming post or term is replaced, whatever its type. Tracked configuration (ACF, menus, snippets, templates...) comes back with the push that follows. Anything else that only exists locally, a test order for example, is lost.
- If the copy stops halfway (network, timeout), run it again: it starts over from a clean local content.
- Users, comments and orders are never copied. Every imported post is attributed to the local user running the command.
- The source URL is rewritten to the local one in content and meta, including serialized values. JSON-escaped URLs (some page builders store them that way) are left as they are.
- The plugin refuses the import on any site whose [environment type](https://developer.wordpress.org/reference/functions/wp_get_environment_type/) is not `local`. LocalWP sets it, elsewhere add `define('WP_ENVIRONMENT_TYPE', 'local');` to `wp-config.php`.

Content never goes the other way: there is no `lps content push`.

## `lps validate`

Check that local tracked files are well formed and push-ready, without contacting WordPress. Exits `1` when it finds a problem, so it fits a pre-commit hook or the first step of a CI job. Hook and API route files get the same checks as push (file name, `declare(strict_types=1);` exactly once, no code outside the class), so those problems surface before push. The server still checks what needs WordPress, PHP syntax and class-name collisions, so a push can still refuse a file `lps validate` passed.

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

Watched types: `snippets`, `templates`, `parts`, `css`, `blocks`, `pages`, `api`, `hooks`, `plugins`.

`lps dev` always targets the environment named `local`, never any other: add one with `lps project config` first. To push to another environment, run the feature's `push` command with `--env`.
