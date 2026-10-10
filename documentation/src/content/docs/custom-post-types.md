---
title: Custom Post Types
description: Declare WordPress custom post types as JSON files in Git, push them with the CLI, and see every post type on the site in wp-admin.
edition: light
---

The `cpt` command group declares WordPress custom post types in code, like CPT UI but from files in your repository instead of an admin screen. Each post type is one JSON file holding the arguments of WordPress's own [`register_post_type()`](https://developer.wordpress.org/reference/functions/register_post_type/), and the Loopress plugin registers it on every request.

A `cpt/` file is data, never PHP: Loopress refuses the few arguments WordPress would run as code (see [File format](#file-format)). That's why custom post types work with both editions of the plugin, Loopress Light included.

## Typical workflow

```bash
# 1. Declare a post type
mkdir -p cpt && cat > cpt/book.json <<'EOF'
{
  "labels": { "name": "Books", "singular_name": "Book" },
  "public": true,
  "has_archive": true,
  "show_in_rest": true,
  "menu_icon": "dashicons-book",
  "supports": ["title", "editor", "thumbnail"],
  "rewrite": { "slug": "books" }
}
EOF

# 2. Commit it
git add cpt/ && git commit -m "feat: add a book post type"

# 3. Deploy it to WordPress
lps cpt push
```

"Books" now appears in the wp-admin menu. Permalinks are refreshed once, on the request after the push, so `/books/` works without visiting Settings > Permalinks.

## Commands

Every command below also accepts the [common flags](/concepts/#common-flags): `--env`, `--json`, and `--yes` where it applies.

### `lps cpt push`

Upload local `cpt/*.json` files to WordPress.

```bash
lps cpt push [path]
```

Each file creates the post type or replaces its arguments. The push never deletes a post type: to stop registering one, use [`lps cpt rm`](#lps-cpt-rm). If the post type was changed on WordPress since it was last read, the push for it is refused instead of overwriting that change.

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./cpt` (or `loopress.json`'s `cptDir`) | Local directory to read `.json` files from |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be pushed without making any changes |

---

### `lps cpt pull`

Download the post types Loopress manages on WordPress into `cpt/<slug>.json` files.

```bash
lps cpt pull [path]
```

Only Loopress post types are pulled. Post types registered by WordPress, a theme or another plugin (ACF, CPT UI...) are never written to `cpt/`, see `lps cpt list` for those.

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./cpt` (or `loopress.json`'s `cptDir`) | Local directory where files are written |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be written without touching the filesystem |

Local files no longer present on WordPress are removed on pull, see [pull mirrors the site](/concepts/#pull-mirrors-the-site).

---

### `lps cpt list`

Print every post type registered on WordPress and where it comes from: Loopress, WordPress, ACF, CPT UI, or a theme or plugin.

```bash
lps cpt list
```

**Example output:**

```
post (Posts): WordPress, 12 published
page (Pages): WordPress, 5 published
book (Books): Loopress, 3 published
event (Events): ACF, 8 published
```

A post type declared in `cpt/` whose slug was already registered by something else is skipped, never overwritten, and `list` warns about it.

---

### `lps cpt rm`

Stop registering a Loopress post type.

```bash
lps cpt rm <slug>
```

Its posts are **not** deleted: they stay in the database, hidden from wp-admin and the site until a post type with the same slug is registered again. The local file is left alone, delete it yourself or the next `lps cpt push` registers the post type again. Asks for confirmation first, `--yes` skips it.

---

### `lps cpt diff`

Show what differs between your local `cpt/` files and a WordPress environment, or between two environments with `--against`. Also part of the aggregate [`lps diff`](/workflow/#lps-diff) (`--only cpt`).

```bash
lps cpt diff [path]
lps cpt diff --env staging --against production
```

Exits `0` in sync, `1` on drift, `2` when the comparison failed.

---

### `lps cpt rollback`

Restore post types on WordPress to the snapshot saved automatically before an earlier `lps cpt push`. See [Rollback and Snapshots](/rollback/).

```bash
lps cpt rollback            # the most recent snapshot
lps cpt rollback --list     # available snapshots
lps cpt rollback --to <id>  # an older one
```

## File format

```
cpt/
  book.json
  event.json
```

The file name is the post type's slug (its permanent key in the database): 1 to 20 lowercase letters, digits, `_` or `-`. WordPress's own post types (`post`, `page`, `attachment`...) and any `wp_` slug are reserved.

The content is the `$args` array of `register_post_type()`, as JSON. Every argument documented by WordPress works, with these exceptions, refused because WordPress would run them as code:

- `register_meta_box_cb`
- `rest_controller_class`, `autosave_rest_controller_class`, `revisions_rest_controller_class`

Need one of those? Register that post type from a [hook](/hooks/) instead.

Arguments WordPress uses as arrays must be arrays: `capabilities`, `labels`, `taxonomies` and `template` always, `supports` or `false`, `rewrite` or `true`/`false`. A wrong type is refused at push, it would otherwise break every page of the site. `lps validate` checks the file name and all of the above before you push.

## In wp-admin

The **Config** tab of the Loopress admin page lists every post type on the site, read-only: its name, slug, source (Loopress, WordPress, ACF, CPT UI, or a theme or plugin) and number of published posts. A Loopress post type skipped because its slug was already registered shows a **Conflict** badge.

## Other ways to declare post types

| Where the post type lives | How Loopress syncs it |
|---------------------------|-----------------------|
| `cpt/<slug>.json` files | `lps cpt`, this page |
| ACF's own post type screen (ACF 6.1+) | [`lps acf`](/acf/), `--type post-types` |
| PHP code calling `register_post_type()` | a [hook](/hooks/) (Loopress Full) |

Pick one per post type: two sources registering the same slug is exactly the conflict the admin page flags.

:::note
Out of scope for now: taxonomies (a separate `lps taxonomy` is planned on the same model), importing post types from CPT UI, and syncing the posts themselves.
:::
