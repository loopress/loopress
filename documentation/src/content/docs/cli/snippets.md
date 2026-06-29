---
title: Snippets
description: Push, pull and list WordPress code snippets from the command line.
---

The `snippets` command group lets you version-control PHP snippets as plain files in Git. Each snippet is stored as a `.php` file in a local directory that you commit like any other code.

Supports the [Code Snippets](https://wordpress.org/plugins/code-snippets/) plugin (default) and [WPCode](https://wpcode.com/).

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
| `--dry-run` / `-d` | Show what would be written without touching the filesystem |
| `--plugin` / `-p` | Target plugin: `code-snippets` (default) or `wpcode` |

**Example:**

```bash
lps snippet pull ./wp-snippets --dry-run
lps snippet pull --plugin wpcode
```

---

### `lps snippet push`

Upload `.php` files from a local directory to WordPress.

- If the file has an `id` in its header comment, the snippet with that id is updated directly.
- Otherwise, a new snippet is created.

```bash
lps snippet push [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./snippets` | Local directory to read `.php` files from |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be pushed without making any changes |
| `--plugin` / `-p` | Target plugin: `code-snippets` (default) or `wpcode` |

**Example:**

```bash
lps snippet push ./wp-snippets
lps snippet push --plugin wpcode
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
| `--plugin` / `-p` | Target plugin: `code-snippets` (default) or `wpcode` |

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

Each snippet is stored as a plain file in the snippets directory. The file extension reflects the snippet type (`.php`, `.css`, `.js`, `.html`, `.txt`).

```
snippets/
  price-formatter.php
  redirect-homepage.php
  custom-login-logo.css
```

### Header comments

`lps snippet pull` automatically writes a header comment at the top of each file containing the snippet's metadata. This header is read back by `lps snippet push` to identify and configure the snippet on WordPress.

**PHP:**

```php
<?php
/**
 * id: 42
 * name: Price Formatter
 * description: Formats WooCommerce prices
 * type: php
 * tags: woocommerce, formatting
 * active: true
 */

// snippet code here...
```

**CSS / JS:**

```css
/**
 * id: 17
 * name: Custom Admin Styles
 * type: css
 * active: true
 */

body { ... }
```

**HTML:**

```html
<!--
  id: 11
  name: Cookie Banner
  type: html
  active: false
-->

<div class="cookie-banner">...</div>
```

### Supported fields

| Field | Description |
|-------|-------------|
| `id` | WordPress snippet ID. Used by `push` to update the correct snippet without fetching the full remote list. |
| `name` | Snippet title in WordPress. Takes precedence over the filename. |
| `description` | Optional description shown in the WordPress admin. |
| `type` | Snippet type: `php`, `css`, `js`, `html`, or `text`. |
| `tags` | Comma-separated list of tags. |
| `active` | Whether the snippet is active (`true` / `false`). |

:::tip
Always run `lps snippet pull` before editing locally so that your files have the `id` header. This ensures `push` updates the right snippet even if you rename the file.
:::

## WPCode support

To target [WPCode](https://wpcode.com/) instead of Code Snippets, pass `--plugin wpcode` to any command. The Loopress plugin must be installed and active on your WordPress site for this to work; it exposes the REST endpoint that the CLI uses.

```bash
lps snippet pull --plugin wpcode
lps snippet push --plugin wpcode
```
