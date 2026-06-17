---
title: Menus
description: Pull and push WordPress navigation menus from the command line.
---

The `menu` command group syncs [Block-based Navigation menus](https://developer.wordpress.org/block-editor/how-to-guides/themes/theme-json/) created via the Full-Site Editing interface. Menus are saved as a JSON file that you can commit and deploy.

## Commands

### `lps menu pull`

Download all navigation menus from WordPress.

```bash
lps menu pull
```

| Flag | Description |
|------|-------------|
| `--config` | Path to the output JSON file (default: `menus.json`) |

**Example:**

```bash
lps menu pull
lps menu pull --config ./theme/menus.json
```

The output file contains an array of navigation post objects including their block content and IDs:

```json
[
  {
    "id": 42,
    "name": "Primary Navigation",
    "content": { "raw": "<!-- wp:navigation-link ... -->" }
  }
]
```

---

### `lps menu push`

Upload menus from a local JSON file back to WordPress. Each menu is matched by its `id`.

```bash
lps menu push
```

| Flag | Description |
|------|-------------|
| `--config` | Path to the source JSON file (default: `menus.json`) |

**Example:**

```bash
lps menu push
lps menu push --config ./theme/menus.json
```

## Typical workflow

```bash
# 1. Pull menus from staging
lps site switch   # select staging
lps menu pull --config menus.json

# 2. Commit to Git
git add menus.json && git commit -m "sync: menus from staging"

# 3. Push to production
lps site switch   # select production
lps menu push --config menus.json
```

## Notes

- Menus are matched by `id`. If the production site has different menu IDs than staging, the push will update the wrong menus. Always verify IDs match before pushing across environments.
- Only block-based Navigation posts are supported (i.e. menus created via the Site Editor, not the classic Appearance → Menus screen).
