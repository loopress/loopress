---
title: Snippets
description: Push, pull and list WordPress code snippets from the command line.
---

The `snippets` command group lets you version-control PHP snippets as plain files in Git. Each snippet is stored as a `.php` file in a local directory that you commit like any other code.

Supports the [Code Snippets](https://wordpress.org/plugins/code-snippets/) plugin (default) and [WPCode](https://wpcode.com/).

## Typical workflow

```bash
# 1. Download existing snippets from WordPress
lps snippets pull

# 2. Edit locally, commit to Git
git add snippets/ && git commit -m "feat: update price formatter snippet"

# 3. Deploy back to WordPress
lps snippets push
```

## Commands

### `lps snippets pull`

Download all snippets from WordPress and write them as `.php` files.

```bash
lps snippets pull [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./snippets` | Local directory where snippets are written |

| Flag | Description |
|------|-------------|
| `--dryRun` / `-d` | Show what would be written without touching the filesystem |
| `--force` / `-f` | Overwrite existing local files |
| `--plugin` / `-p` | Target plugin: `code-snippets` (default) or `wpcode` |

**Example:**

```bash
lps snippets pull ./wp-snippets --dryRun
lps snippets pull --plugin wpcode
```

---

### `lps snippets push`

Upload `.php` files from a local directory to WordPress. If a snippet with the same name already exists it is updated; otherwise a new snippet is created.

```bash
lps snippets push [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./snippets` | Local directory to read `.php` files from |

| Flag | Description |
|------|-------------|
| `--dryRun` / `-d` | Show what would be pushed without making any changes |
| `--plugin` / `-p` | Target plugin: `code-snippets` (default) or `wpcode` |

**Example:**

```bash
lps snippets push ./wp-snippets
lps snippets push --plugin wpcode
```

---

### `lps snippets list`

Print all snippets currently on WordPress.

```bash
lps snippets list
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

Each snippet is stored as a plain `.php` file named after the snippet. The filename (without extension) becomes the snippet name in WordPress.

```
snippets/
  price-formatter.php
  redirect-homepage.php
  custom-login-logo.php
```

## WPCode support

To target [WPCode](https://wpcode.com/) instead of Code Snippets, pass `--plugin wpcode` to any command. The Loopress plugin must be installed and active on your WordPress site for this to work; it exposes the REST endpoint that the CLI uses.

```bash
lps snippets pull --plugin wpcode
lps snippets push --plugin wpcode
```
