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

Composer runs before plugins, so that with a `composer.json` the live plugin versions are merged into the freshly pulled file. ACF, forms and snippets are skipped, not failed, when the site lacks their plugin and the project has no directory for them. On Loopress Light, Composer is always skipped, and the Full-only resources (API routes, hooks, patterns, snippets) are skipped the same way when the project has no directory for them, and fail when it does. A failing resource doesn't stop the others: the command reports each one, then exits non-zero with every failure's reason.

With `--skip-unsupported`, a resource the project uses but the site can't hold is reported `skipped` with its reason instead of failing, and the run exits `0`. See [skipping what a site can't hold](#skipping-what-a-site-cant-hold).

## `lps push`

Push every resource to WordPress, in dependency order: plugins and Composer first, then post types, taxonomies, post meta and roles (before ACF, whose location rules can target them), ACF, API routes, hooks, forms, block patterns, templates and parts, Global Styles, pages, menus, options, and snippets last.

```bash
lps push
lps push --env staging --yes
lps push --dry-run
lps push --only acf,page
lps push --skip plugin --skip composer
lps push --skip-unsupported
```

`--only` and `--skip` take the singular resource ids below, comma-separated or repeated. `--only` narrows the run, `--skip` then removes from it, and the order stays the push order whatever order you wrote. A resource left out is reported `skipped` and never checked against the site, so it can't block the run (an unsupported or missing integration only matters for what you push). Ids: `plugin`, `composer`, `cpt`, `taxonomy`, `meta`, `role`, `acf`, `api`, `hook`, `block`, `form`, `pattern`, `template` (templates, parts and CSS), `theme-style`, `page`, `menu`, `option`, `snippet`.

`lps diff` and `lps dev` use the same singular ids, each for the resources it covers: `lps dev` takes `snippet`, `template`, `part`, `css`, `block`, `page`, `api`, `hook`, `plugin`, and `lps diff` takes the [resource names listed below](#lps-diff).

With a `composer.json` that declares plugins, `plugin` push runs Composer on the server, so `--skip composer` is refused unless `plugin` is skipped too. Left out of `--only plugin`, Composer is reported as pushed by plugins.

When the repository has a `composer.json` that declares plugins, `plugin push` already pushes it whole, so `composer push` is skipped and Composer runs only once on the server.

A resource with no local files (no directory for it) is reported "not configured, skipped" instead of pushed empty: post types, taxonomies, post meta, roles, menus, options, API routes, hooks, dynamic blocks and patterns, like pages, forms, ACF and snippets. Templates and parts are skipped when the project has no template, part or CSS directory, even with `"activateChildTheme": true`: the step would only write an empty child theme. Run `lps theme activate` to activate it anyway. On Loopress Light, what needs Full (plugins, Composer, API routes, hooks, patterns, templates and parts, pages, snippets) is skipped when the project doesn't use it. When it does, the push refuses before pushing anything and names each resource, dry run included.

Unlike `lps pull`, the push stops at the first resource that fails and lists the ones it didn't attempt: later resources depend on earlier ones (hooks use the packages Composer installs, pages need their templates), so pushing them anyway could leave the site half working. Fix the failure and run `lps push` again, resources already pushed are simply written again unchanged. Plugins and Composer are skipped, not failed, when the project doesn't manage them (no `plugins` in `loopress.json`, no `composer.json`). So are ACF, forms and snippets when the project has no directory for them (`acf/`, `forms/`, `snippets/`), on a real push and on `--dry-run` alike: a site without a form plugin no longer fails the preview. When the project does use one of them and the site can't hold it (ACF inactive, no form or snippet plugin, snippets on Loopress Light), the push refuses before pushing anything, and says which plugin to declare or activate. Without a `composer.json`, a plugin `loopress.json` pins active doesn't count as missing: the push's first step installs and activates it, so a fresh site (CI, a new staging) takes the whole project in one run. On `--dry-run`, nothing gets activated, so the steps that need that plugin are skipped instead of previewed. With a `composer.json`, plugins come from it and stay inactive until `--activate`, so the push still refuses.

`--overwrite` is passed on to every resource, see [changes made outside Loopress](/concepts/#changes-made-outside-loopress).

Files the environment excludes in `loopress.json` are left alone on it, never pushed, pruned or mirrored away, and the push lists them as held back, see [holding a feature back](/concepts/#holding-a-feature-back-from-an-environment).

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
| `--only <resources>` | Only compare these resources. Comma-separated or repeated |
| `--skip <resources>` | Compare every resource except these. Comma-separated or repeated |
| `--skip-unsupported` | Skip, instead of comparing, a resource the project uses but a site can't hold, see [below](#skipping-what-a-site-cant-hold) |

Resource names: `snippet`, `form`, `acf`, `api`, `hook`, `page`, `template`, `part`, `menu`, `cpt`, `taxonomy`, `meta`, `role`, `pattern`, `option`, `theme-style`, `composer`.

The exit code makes it a CI drift gate: `0` in sync, `1` on drift, `2` when a resource could not be compared. A resource the project doesn't use (no `acf/`, `forms/` or `snippets/` directory, no Global Styles file) is reported as skipped, not as a failure, when the site lacks its plugin, runs a classic theme, or runs Loopress Light for a feature of Full. A project that uses only what Light holds exits `0` on it. Every feature also has its own `diff` subcommand (`lps snippet diff`, `lps acf diff`, ...) with the same `--against` flag and exit codes.

Against local files, what the environment [excludes](/concepts/#holding-a-feature-back-from-an-environment) in `loopress.json` is left out of the comparison and listed in a separate "held back" group (`heldBack` per resource in `--json`), so a feature held back from production doesn't trip the drift gate.

## `lps promote`

Copy every tracked resource from one environment to another: `lps pull` from the source, then `lps push` to the target.

```bash
lps promote staging production
lps promote production staging --dry-run
lps promote staging production --skip-unsupported
```

`--skip-unsupported` is passed to the pull and to the push, see [skipping what a site can't hold](#skipping-what-a-site-cant-hold).

A real promotion **overwrites your local tracked files** with the source environment's, so it always asks for confirmation (`--yes` in CI), whatever the target's name. If the pull fails, nothing is pushed. Changes made on the target outside Loopress stop the push the same way they stop `lps push`: pass `--overwrite` to promote anyway. To undo a promotion, run the [`rollback`](/rollback/) of each resource that has one, with `--env` set to the target.

With `--dry-run`, the source is pulled into a throwaway copy of the project and the push is only previewed from there: the preview shows what a real promotion would push, and your own files stay untouched. It refuses to run when `loopress.json` points a directory outside the project, use `lps diff --env <from> --against <to>` instead.

The push honors the target's [excludes](/concepts/#holding-a-feature-back-from-an-environment): a feature held back from it is not promoted, and what the target already has under an excluded path stays.

## Skipping what a site can't hold

By default, a project that uses something the site can't hold (ACF inactive, no form or snippet plugin, a Full feature on Loopress Light, a classic theme for Global Styles) is refused: `lps push` pushes nothing, `lps pull` fails that resource. That is deliberate, since pushing the rest can leave a site that looks fine and is broken.

For a quick setup of a site that lacks some of it, pass `--skip-unsupported` to `lps push`, `lps pull`, `lps diff` or `lps promote` (which hands it to its pull and its push). Each such resource is reported as skipped with its reason (`ACF is not active, skipped (--skip-unsupported)`), the run exits `0`, and a final warning lists every skipped resource with how to fix it. With `--json`, the entry has `status: "skipped"` and a `reason`. Nothing else changes: without the flag the behavior is the one above.

The skipped resources may be needed by the others: a page that places a dynamic block, or code that calls a hook, won't work on the site until that resource is pushed. For a lasting, per-environment choice, hold the feature back with [`exclude`](/concepts/#holding-a-feature-back-from-an-environment) instead.

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

It also checks `environments` in `loopress.json`, and warns (without failing) about an `exclude` glob that matches no file.

## `lps dev`

Watch project files and push each change to the `local` environment as soon as you save it.

```bash
lps dev
lps dev --only=snippet,api
lps dev --skip=plugin
```

| Flag | Description |
|------|-------------|
| `--only <resources>` | Only watch these resources. Comma-separated or repeated |
| `--skip <resources>` | Skip these resources. Comma-separated or repeated |

Watched resources: `snippet`, `template`, `part`, `css`, `block`, `page`, `api`, `hook`, `plugin`.

`lps dev` always targets the environment named `local`, never any other: add one with `lps project config` first. To push to another environment, run the feature's `push` command with `--env`.
