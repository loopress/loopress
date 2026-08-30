---
title: Apps CLI
description: Push, pull, list and remove single-page app bundles from the command line.
---

The `app` command group syncs built single-page app bundles between a local `apps/` directory and WordPress. Each subdirectory of `apps/` is one app: a `loopress.app.json` plus a built `dist/` folder.

This is a [Loopress Full](/wordpress-plugin/) feature.

## Typical workflow

```bash
# build with the app's own toolchain (Loopress never runs the build)
npm --prefix apps/search run build

# ship it (only files whose content changed are uploaded, then one atomic commit)
lps app push search

# in a page:  [loopress_app name="search"]
```

## Commands

### `lps app push [name]`

Upload the built bundle for one app, or every app in the directory when `name` is omitted. Builds a manifest of `dist/` (sha256 per file), asks the site which files it already has, uploads only the differences, then commits the new build in one step. The front end keeps serving the old build until that commit lands.

| Argument | Default | Description |
|----------|---------|-------------|
| `name` | every app in `appsDir` | push only this app |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be uploaded without touching the site |
| `--yes` / `-y` | Skip the production confirmation prompt |

### `lps app pull [path]`

Download every committed app into `apps/<name>/dist/`, writing a `loopress.app.json` alongside. Local app directories no longer present on the site are removed (confirmed in a terminal, reported in CI).

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./apps` (or `loopress.json`'s `appsDir`) | local directory to write into |

### `lps app list`

Print the apps currently deployed, with their build id, file count and total size.

```
Apps (1):
  search
     Build:  9f2a1c7b4e10
     Files:  22 files, 2.44 MB
     Deployed: 2026-08-30T12:00:00+00:00
```

### `lps app remove <name>`

Delete an app's bundle from `wp-content/loopress/apps/` and unregister its shortcode. Local files are left untouched. Prompts for confirmation in a terminal; pass `--yes` in scripts.

## File format

```
apps/
  search/
    loopress.app.json
    dist/
      index.html
      assets/index-9a597e0d.js
      assets/index-51910369.css
```

`dist/` is your bundler's output, unchanged. `loopress.app.json` holds a few optional settings, all documented in the [overview](/apps/). The push derives the entry scripts and styles from `dist/index.html`; if there is no `index.html`, add an explicit `entry` object to `loopress.app.json`.

:::caution
Client-side routing must run in hash mode. History-mode routing needs a server rewrite that Loopress does not set up.
:::
