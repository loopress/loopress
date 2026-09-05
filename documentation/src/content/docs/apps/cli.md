---
title: Apps CLI
description: Push, pull, list and remove single-page app bundles from the command line.
---

:::note
Every command below talks to REST endpoints provided by [Loopress Full](/wordpress-plugin/), the free full edition of the plugin, not Loopress Light. Install it on the site first.
:::

The `app` command group syncs built single-page app bundles between a local `apps/` directory and WordPress. Each subdirectory of `apps/` is one app: a `loopress.app.json` plus a built `dist/` folder.

These commands are separate from the aggregate `lps push` / `lps pull` / `lps promote`, which do not sync apps: a build has to run first, so you deploy apps explicitly with `lps app push`.

## The local directory

`push` and `pull` operate on one local directory, resolved the same way:

1. The `path` argument, if given (`pull` only)
2. The `appsDir` key in the project's `loopress.json`, if set
3. `./apps`, the default

## Typical workflow

```bash
# build with the app's own toolchain (Loopress never runs the build)
npm --prefix apps/search run build

# ship it (only files whose content changed are uploaded, then one atomic commit)
lps app push search

# in a page:  [loopress_app name="search"]
```

## Commands

### `lps app push`

Upload the built bundle for one app, or every app in the directory when `name` is omitted. Builds a manifest of `dist/` (sha256 per file), asks the site which files it already has, uploads only the differences, then commits the new build in one step. The front end keeps serving the old build until that commit lands.

```bash
lps app push [name]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `name` | every app in `appsDir` | Push only this app |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | List what would be uploaded and committed without touching the site |
| `--yes` / `-y` | Skip the confirmation prompt shown when the target environment is named `production` |
| `--json` | Print the result as JSON (`{ pushed: [{ name, buildId, uploaded }], status }`) |

Pushing never deletes anything on WordPress. A build that fails to upload or commit leaves the previous build serving.

### `lps app pull`

Download every committed app into `apps/<name>/dist/`, writing a `loopress.app.json` alongside.

```bash
lps app pull [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./apps` (or `loopress.json`'s `appsDir`) | Local directory to write into |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be written and removed without touching the filesystem |
| `--yes` / `-y` | Skip the confirmation asked before removing local app directories |
| `--json` | Print the result as JSON (`{ pulled, orphans, status }`) |

Local app directories (a folder with a `loopress.app.json`) whose app no longer exists on the site are removed on pull, so the directory mirrors what is deployed. In a terminal the list is shown and confirmed first; in scripts and CI they are removed with a warning.

### `lps app list`

Print the apps currently deployed, with their build id, file count and total size. An app that was uploaded but never committed is flagged.

```bash
lps app list
```

| Flag | Description |
|------|-------------|
| `--json` | Output the raw apps array instead of formatted text |

```
Apps (1):
  search
     Build:  9f2a1c7b4e10
     Files:  22 files, 2.44 MB
     Deployed: 2026-08-30T12:00:00+00:00
```

### `lps app remove`

Delete an app's bundle from `wp-content/loopress/apps/` and unregister its shortcode. Local files are left untouched.

```bash
lps app remove <name>
```

| Argument | Default | Description |
|----------|---------|-------------|
| `name` | _(required)_ | The app to remove from WordPress |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Report what would be deleted without touching the site |
| `--yes` / `-y` | Skip the confirmation prompt (and the extra one shown for a `production` environment) |
| `--json` | Print the result as JSON (`{ name, deleted, status }`) |

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
