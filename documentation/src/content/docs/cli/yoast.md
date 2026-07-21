---
title: Yoast SEO
description: Push, pull and list Yoast SEO settings and post meta from the command line.
---

The `yoast` command group lets you version-control [Yoast SEO](https://yoast.com/wordpress/plugins/seo/) configuration as plain JSON files in Git: site-wide Titles & Meta settings (including per-post-type schema defaults) and per-post SEO meta.

Requires Yoast SEO to be installed and active on the WordPress site.

Yoast's redirect manager is a Premium-only feature and isn't covered by this integration.

## Typical workflow

```bash
# 1. Download existing Yoast SEO configuration from WordPress
lps yoast pull

# 2. Edit locally, commit to Git
git add yoast/ && git commit -m "feat: update SEO title templates"

# 3. Deploy back to WordPress
lps yoast push
```

## Commands

### `lps yoast pull`

Download Yoast SEO settings and post meta from WordPress and write them as `.json` files.

```bash
lps yoast pull [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./yoast` (or `loopress.json`'s `yoastDir`) | Local directory where Yoast configuration is written |

| Flag | Description |
|------|-------------|
| `--post-type` | Limit post meta to specific post types. Repeatable. Defaults to `post` and `page`. |
| `--dry-run` / `-d` | Show what would be written without touching the filesystem |

Local post-meta files no longer present on WordPress are removed on pull, so the directory always mirrors the site. `settings.json` is a single file, not a list, so it's always overwritten in place.

**Example:**

```bash
lps yoast pull --post-type post --post-type page --dry-run
```

---

### `lps yoast push`

Upload local `.json` files to WordPress.

```bash
lps yoast push [path]
```

Settings are matched as a single file (`settings.json`). Post meta is matched by its `slug`: the target post must already exist on WordPress (Yoast data syncs onto existing content, push never creates posts).

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./yoast` (or `loopress.json`'s `yoastDir`) | Local directory to read `.json` files from |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be pushed without making any changes |

**Example:**

```bash
lps yoast push ./yoast
```

---

### `lps yoast list`

Print posts with Yoast SEO meta currently on WordPress, grouped by post type.

```bash
lps yoast list
```

| Flag | Description |
|------|-------------|
| `--post-type` | Limit to specific post types. Repeatable. Defaults to `post` and `page`. |
| `--json` / `-j` | Output raw JSON instead of formatted text |

**Example output:**

```
post (2):
  hello-world. Hello World
  second-post. Second Post

page (0):
  (none)
```

## File format

```
yoast/
  settings.json
  post-meta/
    post/
      hello-world.json
    page/
      about.json
```

`settings.json` round-trips Yoast's own Titles & Meta option (`wpseo_titles`) untouched. Each post-meta file holds `{ "slug", "title", "meta" }`, where `meta` is every `_yoast_wpseo_*` postmeta key found on that post, read and written back generically rather than a fixed field list, so new Yoast fields round-trip without any change to the CLI.

:::tip
Always run `lps yoast pull` before editing locally so filenames stay in sync with each post's `slug`.
:::
