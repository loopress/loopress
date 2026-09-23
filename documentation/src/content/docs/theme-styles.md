---
title: Theme Styles
description: Version-control a block theme's Global Styles customizations (Site Editor > Styles) as a plain JSON file.
---

The `theme-styles` command group lets you version-control the Global Styles customizations you make in the WordPress Site Editor's **Styles** screen: colors, typography, and spacing. WordPress stores these in a `wp_global_styles` post, one per theme, separate from the theme's own `theme.json` file (which lives in the theme's own repository and is not what this feature syncs).

Global Styles are a [block theme](https://wordpress.org/documentation/article/block-themes/) (Full Site Editing) feature. `theme-styles` commands fail with a clear error if the site's active theme is a classic theme.

Only the currently active theme's Global Styles are synced. Switching the active theme on WordPress and pulling again writes a new file for the newly active theme, it never deletes the previous one.

## Typical workflow

```bash
# 1. Download the active theme's Global Styles from WordPress
lps theme-styles pull

# 2. Edit locally, commit to Git
git add theme/ && git commit -m "feat: update brand colors in Global Styles"

# 3. Deploy back to WordPress
lps theme-styles push
```

## Commands

### `lps theme-styles pull`

Download the active theme's Global Styles and write them as a `.json` file.

```bash
lps theme-styles pull [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./theme` (or `loopress.json`'s `themeStylesDir`) | Local directory where the Global Styles file is written |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be written without touching the filesystem |

---

### `lps theme-styles push`

Upload the local Global Styles file to WordPress.

```bash
lps theme-styles push [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./theme` (or `loopress.json`'s `themeStylesDir`) | Local directory to read the Global Styles file from |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be pushed without making any changes |

Push fails clearly if no local file exists for the active theme, run `lps theme-styles pull` first.

---

### `lps theme-styles diff`

Show what differs between the local Global Styles file and a WordPress environment.

```bash
lps theme-styles diff [path]
```

This resource is also included automatically in the global [`lps diff`](/cli/#diff).

## File format

```
theme/
  twentytwentyfour-global-styles.json
```

Each file is named `<stylesheet-slug>-global-styles.json` and holds `{ "settings", "styles" }`, the same shape as the `settings`/`styles` keys of a theme's `theme.json`. WordPress bookkeeping fields (the post id, `_links`) are never part of the tracked file.

:::note
The aggregate `lps push` and `lps pull` commands do not include theme styles, run `lps theme-styles push` / `lps theme-styles pull` explicitly. This avoids breaking a run on a site whose active theme is a classic theme.
:::

:::note
Multiple named style variations (WordPress 6.6+) are not supported yet, only the single active style set is synced.
:::
