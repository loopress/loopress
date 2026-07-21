---
title: SEO
description: Push, pull and list SEO settings, post meta, and redirects from the command line, for whichever SEO plugin is active.
---

The `seo` command group lets you version-control SEO configuration as plain JSON files in Git: site-wide Titles & Meta settings (including per-post-type schema defaults), per-post SEO meta, and redirects.

It works with either [RankMath](https://rankmath.com/) or [Yoast SEO](https://yoast.com/wordpress/plugins/seo/), whichever is active on the site, RankMath and Yoast are mutually exclusive: exactly one must be active. If both are active at once, or neither is, every `seo` command fails with a clear error instead of guessing which plugin's data is authoritative.

Redirects are only available when RankMath is active: Yoast's equivalent is a Premium-only feature this integration doesn't support. `seo pull` skips redirects quietly when unsupported (settings and post meta still pull normally); `seo push` fails clearly per file if you have local redirect files and the active plugin can't take them.

## Typical workflow

```bash
# 1. Download existing SEO configuration from WordPress
lps seo pull

# 2. Edit locally, commit to Git
git add seo/ && git commit -m "feat: update SEO title templates"

# 3. Deploy back to WordPress
lps seo push
```

## Commands

### `lps seo pull`

Download SEO settings, post meta, and (if supported) redirects from WordPress and write them as `.json` files.

```bash
lps seo pull [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./seo` (or `loopress.json`'s `seoDir`) | Local directory where SEO configuration is written |

| Flag | Description |
|------|-------------|
| `--post-type` | Limit post meta to specific post types. Repeatable. Defaults to `post` and `page`. |
| `--dry-run` / `-d` | Show what would be written without touching the filesystem |

Local post-meta and redirect files no longer present on WordPress are removed on pull, so the directory always mirrors the site. `settings.json` is a single file, not a list, so it's always overwritten in place.

**Example:**

```bash
lps seo pull --post-type post --post-type page --dry-run
```

---

### `lps seo push`

Upload local `.json` files to WordPress.

```bash
lps seo push [path]
```

Settings are matched as a single file (`settings.json`). Post meta is matched by its `slug`: the target post must already exist on WordPress (SEO data syncs onto existing content, push never creates posts). Redirects are matched by numeric id when present; if a local id no longer exists on the target site, push creates a new redirect instead of failing and renames the local file to the `<id>-<slug>` convention, the same fallback used by `snippet push`.

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./seo` (or `loopress.json`'s `seoDir`) | Local directory to read `.json` files from |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be pushed without making any changes |

**Example:**

```bash
lps seo push ./seo
```

---

### `lps seo list`

Print posts with SEO meta, and redirects if the active plugin supports them, currently on WordPress.

```bash
lps seo list
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

redirects (2):
  1. [active] 301 -> /new-page
  2. [active] 410 -> /discontinued
```

## File format

```
seo/
  settings.json
  post-meta/
    post/
      hello-world.json
    page/
      about.json
  redirects/
    1-new-page.json
    2-discontinued.json
```

`settings.json` round-trips the active plugin's own Titles & Meta option untouched. Each post-meta file holds `{ "slug", "title", "meta" }`, where `meta` is every plugin-prefixed postmeta key found on that post (`rank_math_*` or `_yoast_wpseo_*`), read and written back generically rather than a fixed field list, so new fields and schema types round-trip without any change to the CLI. Each redirect file holds `{ "id", "sources", "urlTo", "headerCode", "status", "hits", "createdAt", "updatedAt" }`.

:::tip
Always run `lps seo pull` before editing locally so filenames stay in sync with each post's `slug` and each redirect's `id`.
:::
