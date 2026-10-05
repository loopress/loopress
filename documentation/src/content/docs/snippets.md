---
title: Snippets
description: Push, pull and list WordPress code snippets from the command line.
edition: full
---

The `snippet` command group lets you version-control PHP snippets as plain files in Git. Each snippet is stored as a code file alongside a `.json` sidecar in a local directory that you commit like any other code.

Works with either [WPCode](https://wpcode.com/) or the [Code Snippets](https://wordpress.org/plugins/code-snippets/) plugin. The Loopress WordPress plugin detects whichever one is active on the site, so the CLI commands are the same either way.

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

Every command below also accepts the [common flags](/concepts/#common-flags): `--env`, `--yes`, and `--json` where it applies.

### `lps snippet pull`

Download all snippets from WordPress and write them as `.php` files.

```bash
lps snippet pull [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./snippets` (or `loopress.json`'s `snippetsDir`) | Local directory where snippets are written |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be written without touching the filesystem |

Local files following the `<id>-<slug>` naming whose id is no longer on WordPress are removed on pull, so the directory always mirrors the site. See [pull mirrors the site](/concepts/#pull-mirrors-the-site) for the confirmation asked first. Snippets with no name are skipped with a warning.

**Example:**

```bash
lps snippet pull ./wp-snippets --dry-run
```

---

### `lps snippet push`

Upload `.php` files from a local directory to WordPress.

- If the sidecar `.json` contains an `id`, that snippet is updated by ID.
- If that id doesn't exist on the target site (e.g. a fresh WordPress install), a new snippet is created instead and the local sidecar is updated with the assigned id.
- Otherwise, a new snippet is created.

After a push, local files that don't already follow the `<id>-<slug>` naming (a hand-created `demo.php`, or a stale slug after a rename) are renamed on disk to match, the same convention `lps snippet pull` writes.

```bash
lps snippet push [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./snippets` (or `loopress.json`'s `snippetsDir`) | Local directory to read snippet files from |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be pushed without making any changes |

**Example:**

```bash
lps snippet push ./wp-snippets
```

---

### `lps snippet list`

Print all snippets currently on WordPress.

```bash
lps snippet list
```

| Flag | Description |
|------|-------------|
| `--json` | Output raw JSON instead of formatted text |

**Example output:**

```
Found 3 snippets:

  42. Price Formatter
     Active: yes
     Tags: woocommerce, formatting
     Description: Formats WooCommerce prices

  17. Redirect Homepage
     Active: no
```

---

### `lps snippet diff`

Show what differs between your local snippets and a WordPress environment, or between two environments with `--against`. Also part of the aggregate [`lps diff`](/workflow/#lps-diff) (`--only snippet`).

```bash
lps snippet diff [path]
lps snippet diff --env staging --against production
```

Exits `0` in sync, `1` on drift, `2` when the comparison failed.

---

### `lps snippet rollback`

Restore snippets on WordPress to the snapshot saved automatically before an earlier `lps snippet push`. See [Rollback and Snapshots](/rollback/).

```bash
lps snippet rollback            # the most recent snapshot
lps snippet rollback --list     # available snapshots
lps snippet rollback --to <id>  # an older one
```

---

### `lps snippet publish`

Publish local snippet files to your Loopress account so they can be deployed to other projects. This does not touch any WordPress site, it uploads to Loopress only.

Requires `lps login` first, and the current project must be linked to your [Loopress account](/account/) (`lps project push`). Since it never talks to WordPress, it works whichever plugin edition is installed.

```bash
lps snippet publish [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./snippets` (or `loopress.json`'s `snippetsDir`) | Local directory to read snippet files from |

**Example:**

```bash
lps snippet publish
lps snippet publish ./wp-snippets
```

## File format

:::tip
PHP snippets call WordPress functions from a repo where WordPress isn't installed. Set up [WordPress stubs](/editor-setup/) once to get autocomplete and static analysis in your editor.
:::

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
