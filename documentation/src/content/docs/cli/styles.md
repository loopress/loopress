---
title: Global Styles
description: Pull and push WordPress Global Styles (theme.json / FSE) from the command line.
---

The `styles` command group syncs the [Global Styles](https://developer.wordpress.org/block-editor/how-to-guides/themes/global-settings-and-styles/) of a Full-Site Editing (FSE) WordPress theme. It reads and writes the JSON payload that drives `theme.json` and any extra CSS added via the Site Editor.

## How it works

WordPress stores Global Styles as a custom post. The CLI fetches that post (including its ID) on `pull` and writes it back on `push`. Because the ID is embedded in the saved JSON file, you must always **pull before push** on a fresh checkout.

The CLI reads the styles directory from `loopress.json` (`styles` key, default `./styles`). All files are read from and written to that directory.

## Commands

### `lps styles pull`

Download the current Global Styles from WordPress and save them to `global-styles.json` inside the styles directory.

```bash
lps styles pull
```

The output file defaults to `./styles/global-styles.json` and contains the style ID required for push.

**Example:**

```bash
lps styles pull
lps styles pull --dryRun
```

---

### `lps styles push`

Upload Global Styles back to WordPress. The command reads `global-styles.json` from the styles directory and also bundles any `*.css` files found there, injecting them as the custom CSS property.

```bash
lps styles push
```

| Flag | Description |
|------|-------------|
| `--dryRun` / `-d` | Show the payload that would be sent without making changes |

**Example:**

```bash
# Pull first, then edit, then push:
lps styles pull
# ... edit ./styles/global-styles.json or add CSS files ...
lps styles push
```

## Recommended directory layout

```
styles/
  global-styles.json   ← pulled from WordPress (commit this)
  typography.css
  components.css
  overrides.css
```

The JSON file is committed to Git. CSS files are bundled on the fly during `push` so you can split your custom CSS across multiple files without touching `global-styles.json` manually.

You can change the styles directory via `loopress.json`:

```json
{
  "styles": "theme/styles"
}
```

## Notes

- `global-styles.json` must contain an `id` field. If the file is missing (i.e. you have never pulled), the push will fail — always pull first on a fresh checkout.
- Global Styles are theme-specific. Switching themes resets them; always re-pull after a theme change.
