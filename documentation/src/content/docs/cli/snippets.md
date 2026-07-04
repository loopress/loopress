---
title: Snippets
description: Push, pull and list WordPress code snippets from the command line.
---

The `snippet` command group lets you version-control PHP snippets as plain files in Git. Each snippet is stored as a code file alongside a `.json` sidecar in a local directory that you commit like any other code.

Supports [WPCode](https://wpcode.com/) (default) and the [Code Snippets](https://wordpress.org/plugins/code-snippets/) plugin.

## Typical workflow

```bash
# 1. Download existing snippets from WordPress
lps snippet pull

# 2. Edit locally, commit to Git
git add snippets/ && git commit -m "feat: update price formatter snippet"

# 3. Deploy back to WordPress
lps snippet push
```

## Commands

### `lps snippet pull`

Download all snippets from WordPress and write them as `.php` files.

```bash
lps snippet pull [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./snippets` | Local directory where snippets are written |

| Flag | Description |
|------|-------------|
| `--dryRun` / `-d` | Show what would be written without touching the filesystem |
| `--plugin` / `-p` | Target plugin: `wpcode` (default) or `code-snippets` |

**Example:**

```bash
lps snippet pull ./wp-snippets --dryRun
lps snippet pull --plugin code-snippets
```

---

### `lps snippet push`

Upload `.php` files from a local directory to WordPress.

- If the sidecar `.json` contains an `id`, that snippet is updated by ID.
- Otherwise, a new snippet is created.

```bash
lps snippet push [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./snippets` | Local directory to read `.php` files from |

| Flag | Description |
|------|-------------|
| `--dryRun` / `-d` | Show what would be pushed without making any changes |
| `--plugin` / `-p` | Target plugin: `wpcode` (default) or `code-snippets` |

**Example:**

```bash
lps snippet push ./wp-snippets
lps snippet push --plugin code-snippets
```

---

### `lps snippet list`

Print all snippets currently on WordPress.

```bash
lps snippet list
```

| Flag | Description |
|------|-------------|
| `--json` / `-j` | Output raw JSON instead of formatted text |
| `--plugin` / `-p` | Target plugin: `wpcode` (default) or `code-snippets` |

**Example output:**

```
Found 3 snippets:

  1. price-formatter
     Active: ✓
     Tags: cli-import
     Description: Formats WooCommerce prices

  2. redirect-homepage
     Active: ✗
```

## File format

Each snippet is stored as two files in the snippets directory: a code file and a `.json` sidecar that holds the metadata. Files are named `{id}-{slug}.{ext}`, where `{slug}` is the snippet name lowercased and slugified.

```
snippets/
  42-price-formatter.php
  42-price-formatter.json
  17-redirect-homepage.php
  17-redirect-homepage.json
  11-custom-login-logo.css
  11-custom-login-logo.json
```

### Sidecar files

`lps snippet pull` writes a `.json` sidecar next to each snippet file. The sidecar holds the metadata that `lps snippet push` uses to identify and configure the snippet on WordPress.

```json
{
  "id": 42,
  "name": "Price Formatter",
  "type": "php",
  "active": true,
  "description": "Formats WooCommerce prices",
  "tags": ["woocommerce", "formatting"]
}
```

### Supported fields

| Field | Description |
|-------|-------------|
| `id` | WordPress snippet ID. Used by `push` to update the correct snippet. |
| `name` | Snippet title in WordPress. Takes precedence over the filename. |
| `description` | Optional description shown in the WordPress admin. |
| `type` | Snippet type: `php`, `css`, `js`, `html`, or `text`. |
| `tags` | Array of tag strings. |
| `active` | Whether the snippet is active (`true` / `false`). |

:::tip
Always run `lps snippet pull` before editing locally so that your files have the `id` in the sidecar. This ensures `push` updates the right snippet even if you rename the file.
:::

## Code Snippets support

WPCode is the default plugin. To target [Code Snippets](https://wordpress.org/plugins/code-snippets/) instead, pass `--plugin code-snippets` to any command.

```bash
lps snippet pull --plugin code-snippets
lps snippet push --plugin code-snippets
```

