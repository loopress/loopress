---
title: Pages
description: Push, pull and list WordPress pages from the command line.
---

The `page` command group lets you version-control WordPress pages in Git, as an editable `.html` content file plus a `.json` sidecar for metadata.

Unlike `acf`, `seo`, `form` and `snippet`, this talks directly to WordPress core's own REST API (`wp/v2/pages`), so it works on any WordPress site, no Loopress plugin required.

## Typical workflow

```bash
# 1. Download existing pages from WordPress
lps page pull

# 2. Edit locally, commit to Git
git add pages/ && git commit -m "feat: update about page"

# 3. Deploy back to WordPress
lps page push
```

## Commands

### `lps page pull`

Download all pages from WordPress and write them as an `.html`/`.json` file pair per page.

```bash
lps page pull [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./pages` (or `loopress.json`'s `pageDir`) | Local directory where pages are written |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be written without touching the filesystem |

Local files with an id no longer present on WordPress are removed on pull, so the directory always mirrors the site. In a terminal the files are listed and a confirmation is asked first (`--yes` skips it); in scripts and CI they are removed and reported. Pages with no id are skipped with a warning.

**Example:**

```bash
lps page pull --dry-run
```

---

### `lps page push`

Upload `.html`/`.json` file pairs from a local directory to WordPress. Each page is matched by its `id`; if a local id doesn't exist on the target site (e.g. a fresh install), a new page is created instead and both local files are renamed to match the assigned id.

```bash
lps page push [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./pages` (or `loopress.json`'s `pageDir`) | Local directory to read `.json` files from |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be pushed without making any changes |

**Example:**

```bash
lps page push ./pages
```

---

### `lps page list`

Print all pages currently on WordPress.

```bash
lps page list
```

| Flag | Description |
|------|-------------|
| `--json` / `-j` | Output raw JSON instead of formatted text |

**Example output:**

```
Pages (2):
  2. Sample Page
  9. About
```

## File format

Each page is stored as a pair of files, named `{id}-{slug}.html` and `{id}-{slug}.json`, where `{slug}` is the page title lowercased and slugified:

```
pages/
  2-sample-page.html
  2-sample-page.json
  9-about.html
  9-about.json
```

The `.html` file is the page's raw content exactly as WordPress stores it, Gutenberg block comments included (`<!-- wp:paragraph -->...`), a real file you can open and edit directly. The `.json` sidecar is everything else, round-tripping WordPress's own REST representation untouched: `title` and `excerpt` as `{raw, rendered}`, plus `slug`, `status`, `parent`, `menu_order`, `template`, `meta`, and so on. Content is kept out of the JSON on purpose, escaped HTML inside a JSON string isn't something you can reasonably hand-edit.

:::caution
`parent` is stored as the source site's raw page id. Pushing to a site where that id belongs to a different page (or doesn't exist) will mis-parent or orphan the page there, ids aren't remapped across sites.
:::

:::tip
Always run `lps page pull` before editing locally so filenames stay in sync with each page's `id`.
:::
