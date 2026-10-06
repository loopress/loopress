---
title: Theme Styles
description: Version-control a block theme's Global Styles customizations (Site Editor > Styles) as a plain JSON file.
edition: light
---

The `theme style` command group lets you version-control the Global Styles customizations you make in the WordPress Site Editor's **Styles** screen: colors, typography, and spacing. WordPress stores these in a `wp_global_styles` post, one per theme, separate from the theme's own `theme.json` file (which lives in the theme's own repository and is not what this feature syncs).

Global Styles are a [block theme](https://wordpress.org/documentation/article/block-themes/) (Full Site Editing) feature. `theme style` commands fail with a clear error if the site's active theme is a classic theme.

Only the currently active theme's Global Styles are synced. Switching the active theme on WordPress and pulling again writes a new file for the newly active theme, it never deletes the previous one.

## Typical workflow

```bash
# 1. Download the active theme's Global Styles from WordPress
lps theme style pull

# 2. Edit locally, commit to Git
git add theme/ && git commit -m "feat: update brand colors in Global Styles"

# 3. Deploy back to WordPress
lps theme style push
```

## Commands

Every command below also accepts the [common flags](/concepts/#common-flags): `--env`, `--json`, and `--yes` where it applies.

### `lps theme style pull`

Download the active theme's Global Styles and write them as a `.json` file.

```bash
lps theme style pull [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./theme` (or `loopress.json`'s `themeStylesDir`) | Local directory where the Global Styles file is written |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be written without touching the filesystem |

---

### `lps theme style push`

Upload the local Global Styles file to WordPress.

```bash
lps theme style push [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./theme` (or `loopress.json`'s `themeStylesDir`) | Local directory to read the Global Styles file from |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be pushed without making any changes |

Push fails clearly if no local file exists for the active theme, run `lps theme style pull` first.

---

### `lps theme style diff`

Show what differs between the local Global Styles file and a WordPress environment, or between two environments with `--against`. Also part of the aggregate [`lps diff`](/workflow/#lps-diff) (`--only theme-styles`).

```bash
lps theme style diff [path]
lps theme style diff --env staging --against production
```

Exits `0` in sync, `1` on drift, `2` when the comparison failed.

---

### `lps theme style rollback`

Restore the active theme's Global Styles on WordPress to the snapshot saved automatically before an earlier `lps theme style push`. See [Rollback and Snapshots](/rollback/).

```bash
lps theme style rollback            # the most recent snapshot
lps theme style rollback --list     # available snapshots
lps theme style rollback --to <id>  # an older one
```

## File format

```
theme/
  twentytwentyfour-global-styles.json
```

Each file is named `<stylesheet-slug>-global-styles.json` and holds `{ "settings", "styles" }`, the same shape as the `settings`/`styles` keys of a theme's `theme.json`. WordPress bookkeeping fields (the post id, `_links`) are never part of the tracked file.

:::note
The aggregate [`lps push` and `lps pull`](/workflow/#what-each-command-covers) do not include theme styles, run `lps theme style push` / `lps theme style pull` (or the whole-topic [`lps theme push` / `lps theme pull`](/themes/#commands)) explicitly. This avoids breaking a run on a site whose active theme is a classic theme.
:::

:::note
Multiple named style variations (WordPress 6.6+) are not supported yet, only the single active style set is synced.
:::
