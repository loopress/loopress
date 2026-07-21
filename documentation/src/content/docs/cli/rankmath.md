---
title: RankMath
description: Push, pull and list RankMath SEO settings, post meta, and redirects from the command line.
---

The `rankmath` command group lets you version-control [RankMath](https://rankmath.com/) SEO configuration as plain JSON files in Git: site-wide Titles & Meta settings (including per-post-type schema defaults), per-post SEO meta, and redirects.

Requires RankMath to be installed and active on the WordPress site.

## Typical workflow

```bash
# 1. Download existing RankMath configuration from WordPress
lps rankmath pull

# 2. Edit locally, commit to Git
git add rankmath/ && git commit -m "feat: update SEO title templates"

# 3. Deploy back to WordPress
lps rankmath push
```

## Commands

### `lps rankmath pull`

Download RankMath settings, post meta, and redirects from WordPress and write them as `.json` files.

```bash
lps rankmath pull [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./rankmath` (or `loopress.json`'s `rankmathDir`) | Local directory where RankMath configuration is written |

| Flag | Description |
|------|-------------|
| `--post-type` | Limit post meta to specific post types. Repeatable. Defaults to `post` and `page`. |
| `--dry-run` / `-d` | Show what would be written without touching the filesystem |

Local post-meta and redirect files no longer present on WordPress are removed on pull, so the directory always mirrors the site. `settings.json` is a single file, not a list, so it's always overwritten in place.

**Example:**

```bash
lps rankmath pull --post-type post --post-type page --dry-run
```

---

### `lps rankmath push`

Upload local `.json` files to WordPress.

```bash
lps rankmath push [path]
```

Settings are matched as a single file (`settings.json`). Post meta is matched by its `slug`: the target post must already exist on WordPress (RankMath data syncs onto existing content, push never creates posts). Redirects are matched by numeric id when present; if a local id no longer exists on the target site, push creates a new redirect instead of failing and renames the local file to the `<id>-<slug>` convention, the same fallback used by `snippet push`.

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./rankmath` (or `loopress.json`'s `rankmathDir`) | Local directory to read `.json` files from |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be pushed without making any changes |

**Example:**

```bash
lps rankmath push ./rankmath
```

---

### `lps rankmath list`

Print all redirects currently configured on WordPress.

```bash
lps rankmath list
```

| Flag | Description |
|------|-------------|
| `--json` / `-j` | Output raw JSON instead of formatted text |

**Example output:**

```
redirects (2):
  1. [active] 301 -> /new-page
  2. [active] 410 -> /discontinued
```

## File format

```
rankmath/
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

`settings.json` round-trips RankMath's own Titles & Meta option untouched. Each post-meta file holds `{ "slug", "title", "meta" }`, where `meta` is every `rank_math_*` postmeta key found on that post, read and written back generically rather than a fixed field list, so new RankMath fields and schema types round-trip without any change to the CLI. Each redirect file holds `{ "id", "sources", "urlTo", "headerCode", "status", "hits", "createdAt", "updatedAt" }`.

:::tip
Always run `lps rankmath pull` before editing locally so filenames stay in sync with each post's `slug` and each redirect's `id`.
:::
