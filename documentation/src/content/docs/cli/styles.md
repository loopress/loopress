---
title: Global Styles
description: Pull and push WordPress Global Styles (theme.json / FSE) from the command line.
---

The `styles` command group syncs the [Global Styles](https://developer.wordpress.org/block-editor/how-to-guides/themes/global-settings-and-styles/) of a Full-Site Editing (FSE) WordPress theme. It reads and writes the JSON payload that drives `theme.json` and any extra CSS added via the Site Editor.

## How it works

WordPress stores Global Styles as a custom post. The CLI fetches that post (including its ID) on `pull` and writes it back on `push`. Because the ID is embedded in the saved JSON file, you must always **pull before push** on a fresh checkout.

## Commands

### `lps styles pull`

Download the current Global Styles from WordPress and save them to a JSON file.

```bash
lps styles pull [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./styles.json` | Output file (includes the style ID required for push) |

**Example:**

```bash
lps styles pull
lps styles pull ./theme/styles.json
```

---

### `lps styles push`

Upload Global Styles back to WordPress. The command also bundles any `*.css` files found in `./styles/**/*.css` and injects them as the custom CSS property.

```bash
lps styles push [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./styles.json` | JSON file previously created by `pull` |

| Flag | Description |
|------|-------------|
| `--dryRun` / `-d` | Show the payload that would be sent without making changes |

**Example:**

```bash
# Edit styles.json, then:
lps styles push

# With extra CSS files:
# ./styles/typography.css and ./styles/components.css are bundled automatically
```

## Recommended directory layout

```
styles.json          ← pulled from WordPress (commit this)
styles/
  typography.css
  components.css
  overrides.css
```

The JSON file is committed to Git. CSS files are bundled on the fly during `push` so you can split your custom CSS across multiple files without touching `styles.json` manually.

## Notes

- The `path` argument must point to a JSON file that contains an `id` field. If the file is missing an `id`, the push will fail with an error.
- Global Styles are theme-specific. Switching themes resets them; always re-pull after a theme change.
