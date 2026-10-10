---
title: Taxonomies
description: Declare WordPress taxonomies as JSON files in Git, attach them to post types, and see every taxonomy on the site in wp-admin. Terms stay content.
edition: light
---

The `taxonomy` command group declares WordPress taxonomies in code, the same way [`lps cpt`](/custom-post-types/) declares post types. Each taxonomy is one JSON file holding the arguments of WordPress's own [`register_taxonomy()`](https://developer.wordpress.org/reference/functions/register_taxonomy/), and the Loopress plugin registers it on every request.

Only the taxonomy itself is versioned: its name, labels, whether it nests like categories or stays flat like tags, its URL. Its **terms** ("Fantasy", "Sci-fi", every tag on a post) are content, created by editors, and stay in the database like posts do. Loopress never pulls, pushes or deletes them.

Like post types, a `taxonomies/` file is data, never PHP, so taxonomies work with both editions of the plugin, Loopress Light included.

## Typical workflow

```bash
# 1. Declare a taxonomy, attached to the "book" post type
mkdir -p taxonomies && cat > taxonomies/genre.json <<'EOF'
{
  "object_type": ["book"],
  "labels": { "name": "Genres", "singular_name": "Genre" },
  "hierarchical": true,
  "show_in_rest": true,
  "show_admin_column": true,
  "rewrite": { "slug": "genre" }
}
EOF

# 2. Commit it
git add taxonomies/ && git commit -m "feat: add a genre taxonomy to books"

# 3. Deploy it to WordPress
lps taxonomy push
```

"Genres" now appears under "Books" in wp-admin. Permalinks are refreshed once, on the request after the push.

## Commands

Every command below also accepts the [common flags](/concepts/#common-flags): `--env`, `--json`, and `--yes` where it applies. They work exactly like their [`lps cpt`](/custom-post-types/#commands) counterparts.

| Command | What it does |
|---------|--------------|
| `lps taxonomy push [path]` | Create or update each taxonomy from `taxonomies/*.json`. Never deletes a taxonomy, never touches terms. Refused if the taxonomy changed on WordPress since it was last read. |
| `lps taxonomy pull [path]` | Write the taxonomies Loopress manages to `taxonomies/<slug>.json`. Taxonomies from WordPress, a theme or another plugin are never pulled. Local files no longer on WordPress are removed, see [pull mirrors the site](/concepts/#pull-mirrors-the-site). |
| `lps taxonomy list` | Every taxonomy on the site, where it comes from (Loopress, WordPress, ACF, CPT UI, a theme or plugin), how many terms it has and which post types it's attached to. |
| `lps taxonomy rm <slug>` | Stop registering a Loopress taxonomy. Its terms are **not** deleted: they stay in the database, hidden until it's registered again. The local file is left alone. Asks for confirmation, `--yes` skips it. |
| `lps taxonomy diff [path]` | What differs between `taxonomies/` and an environment, or two environments with `--against`. Also part of [`lps diff`](/workflow/#lps-diff) (`--only taxonomy`). |
| `lps taxonomy rollback` | Restore the snapshot saved before an earlier push, see [Rollback and Snapshots](/rollback/). |

**Example `lps taxonomy list` output:**

```
category (Categories): WordPress, 12 terms, on post
post_tag (Tags): WordPress, 48 terms, on post
genre (Genres): Loopress, 7 terms, on book
```

## File format

```
taxonomies/
  genre.json
  region.json
```

The file name is the taxonomy's slug: 1 to 32 lowercase letters, digits, `_` or `-`. WordPress's own taxonomies (`category`, `post_tag`, `nav_menu`, `post_format`...), any `wp_` slug, and the public query vars a taxonomy would shadow (`author`, `year`, `name`, `type`...) are reserved.

The content is the `$args` array of `register_taxonomy()`, as JSON, plus one key that isn't one of its arguments:

- `object_type`: the post types the taxonomy attaches to, `register_taxonomy()`'s second parameter. A list, even for one post type (`["book"]`). Leave it out to register the taxonomy unattached, then attach it from a post type's own `taxonomies` argument in `cpt/`.

Every argument documented by WordPress works, except the ones it would run as code:

- `meta_box_cb`, `meta_box_sanitize_cb`, `update_count_callback`
- `rest_controller_class`

Need one of those? Register that taxonomy from a [hook](/hooks/) instead. `labels`, `capabilities` and `object_type` must be JSON objects or arrays, `rewrite` an object or `true`/`false`: a wrong type is refused at push. `lps validate` checks all of this before you push.

## In wp-admin

The **Config** tab of the Loopress admin page lists every taxonomy on the site next to the post types, read-only: name, slug, source, the post types it's attached to and its number of terms. A Loopress taxonomy skipped because its slug was already registered shows a **Conflict** badge.

## Other ways to declare taxonomies

| Where the taxonomy lives | How Loopress syncs it |
|--------------------------|-----------------------|
| `taxonomies/<slug>.json` files | `lps taxonomy`, this page |
| ACF's own taxonomy screen (ACF 6.1+) | [`lps acf`](/acf/), `--type taxonomies` |
| PHP code calling `register_taxonomy()` | a [hook](/hooks/) (Loopress Full) |

:::note
Terms are out of scope by design: a taxonomy is structure, its terms are content. Versioning a closed list of terms that code depends on (an "event type" with a fixed set of values) may come later as an opt-in. Free tagging never will.
:::
