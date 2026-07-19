---
title: ACF
description: Push, pull and list Advanced Custom Fields configuration from the command line.
---

The `acf` command group lets you version-control [Advanced Custom Fields](https://www.advancedcustomfields.com/) configuration as plain JSON files in Git: field groups, post types, taxonomies, and options pages.

Requires ACF to be installed and active on the WordPress site. Options pages additionally require ACF PRO.

## Typical workflow

```bash
# 1. Download existing ACF configuration from WordPress
lps acf pull

# 2. Edit locally, commit to Git
git add acf/ && git commit -m "feat: add pricing field group"

# 3. Deploy back to WordPress
lps acf push
```

## Commands

### `lps acf pull`

Download ACF field groups, post types, taxonomies, and options pages from WordPress and write them as `.json` files, one per object.

```bash
lps acf pull [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./acf` (or `loopress.json`'s `acfDir`) | Local directory where ACF configuration is written |

| Flag | Description |
|------|-------------|
| `--type` | Limit to specific object types: `field-groups`, `post-types`, `taxonomies`, `options-pages`. Repeatable. |
| `--dryRun` / `-d` | Show what would be written without touching the filesystem |

Local files with a `key` no longer present on WordPress are removed on pull, so the directory always mirrors the site.

**Example:**

```bash
lps acf pull --type field-groups --dryRun
```

---

### `lps acf push`

Upload `.json` files from a local directory to WordPress. Each object is identified by its own stable `key`, so push always resolves to create-or-update on that object, there's no id/slug matching step like snippets.

```bash
lps acf push [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./acf` (or `loopress.json`'s `acfDir`) | Local directory to read `.json` files from |

| Flag | Description |
|------|-------------|
| `--type` | Limit to specific object types: `field-groups`, `post-types`, `taxonomies`, `options-pages`. Repeatable. |
| `--dryRun` / `-d` | Show what would be pushed without making any changes |

**Example:**

```bash
lps acf push ./acf
```

---

### `lps acf list`

Print all ACF objects currently on WordPress, grouped by type.

```bash
lps acf list
```

| Flag | Description |
|------|-------------|
| `--type` | Limit to specific object types: `field-groups`, `post-types`, `taxonomies`, `options-pages`. Repeatable. |
| `--json` / `-j` | Output raw JSON instead of formatted text |

**Example output:**

```
field-groups (2):
  group_pricing. Pricing Fields
  group_homepage. Homepage Fields

options-pages (0):
  (none)
```

## File format

Each ACF object is stored as one file, named `{key}.json`, in a subdirectory per type:

```
acf/
  field-groups/
    group_pricing.json
    group_homepage.json
  post-types/
    post_type_testimonial.json
  taxonomies/
  options-pages/
```

Files round-trip ACF's own export format untouched, the CLI only reads the `key` field to name the file and identify the object on push.

:::tip
Always run `lps acf pull` before editing locally so filenames stay in sync with each object's `key`.
:::
