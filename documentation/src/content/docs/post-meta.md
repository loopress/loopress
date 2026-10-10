---
title: Post Meta
description: Declare WordPress post meta keys as JSON files in Git, with their type, default and REST exposure. Meta values stay content.
edition: light
---

The `meta` command group declares post meta keys in code, the same way [`lps cpt`](/custom-post-types/) declares post types. Each post type gets one JSON file listing its keys, each with the arguments of WordPress's own [`register_post_meta()`](https://developer.wordpress.org/reference/functions/register_post_meta/), and the Loopress plugin registers them on every request.

Only the keys are versioned: their name, type, default value, and whether they appear in the REST API. The **values** (the ISBN of each book, the page count of each post) are content, edited in WordPress, and stay in the database. Loopress never pulls, pushes or deletes them.

A declared key gets a type WordPress enforces, a default returned when no value is set, and, with `show_in_rest`, a place in the REST API response of its post type: what a headless front or a script reads. To give editors a form to fill those values in, use [ACF](/acf/): `lps meta` declares, ACF edits.

Like post types, a `meta/` file is data, never PHP, so post meta works with both editions of the plugin, Loopress Light included.

## Typical workflow

```bash
# 1. Declare the meta keys of the "book" post type
mkdir -p meta && cat > meta/book.json <<'EOF'
{
  "isbn": { "type": "string", "single": true, "show_in_rest": true },
  "page_count": { "type": "integer", "single": true, "default": 0, "show_in_rest": true }
}
EOF

# 2. Commit it
git add meta/ && git commit -m "feat: declare book meta keys"

# 3. Deploy it to WordPress
lps meta push
```

`GET /wp-json/wp/v2/book/<id>` now returns a `meta` object with `isbn` and `page_count`.

## Commands

Every command below also accepts the [common flags](/concepts/#common-flags): `--env`, `--json`, and `--yes` where it applies. They work exactly like their [`lps cpt`](/custom-post-types/#commands) counterparts.

| Command | What it does |
|---------|--------------|
| `lps meta push [path]` | Create or update the keys of each post type from `meta/*.json`. Never deletes, never touches values. Refused if the post type's keys changed on WordPress since they were last read. |
| `lps meta pull [path]` | Write the keys Loopress manages to `meta/<post-type>.json`. Keys registered by a theme or another plugin are never pulled. Local files no longer on WordPress are removed, see [pull mirrors the site](/concepts/#pull-mirrors-the-site). |
| `lps meta list` | Every meta key registered for a post type on the site, whether Loopress declares it, its type, and whether it's in REST. |
| `lps meta rm <post-type>` | Stop registering the Loopress keys of one post type. Their values are **not** deleted. The local file is left alone. Asks for confirmation, `--yes` skips it. |
| `lps meta diff [path]` | What differs between `meta/` and an environment, or two environments with `--against`. Also part of [`lps diff`](/workflow/#lps-diff) (`--only meta`). |
| `lps meta rollback` | Restore the snapshot saved before an earlier push, see [Rollback and Snapshots](/rollback/). |

**Example `lps meta list` output:**

```
book.isbn (string): Loopress, in REST
book.page_count (integer): Loopress, in REST
product._sku (string): theme or plugin
```

`lps meta list` only shows keys registered with `register_post_meta()`. Most plugins store meta without registering it, so a key in use on the site may not be listed.

## File format

```
meta/
  book.json
  post.json
```

The file name is the post type the keys belong to: 1 to 20 lowercase letters, digits, `_` or `-`. WordPress's own `post` and `page` work too. The post type doesn't have to exist yet: it can come from a [`cpt/`](/custom-post-types/) file or another plugin.

The content maps each meta key (1 to 255 letters, digits, `_` or `-`) to its `register_post_meta()` arguments:

| Argument | Value |
|----------|-------|
| `type` | Required. `string`, `boolean`, `integer`, `number`, `array` or `object` |
| `single` | `true` for one value per post, `false` (the default) for a list of values |
| `default` | Returned when no value is set. Must match `type` |
| `show_in_rest` | `true`, `false`, or an object with a JSON `schema`. An `array` or `object` key needs the schema to appear in REST |
| `description` | Free text |

An `array` key exposed in REST, for example:

```json
{
  "authors": {
    "type": "array",
    "single": true,
    "show_in_rest": { "schema": { "items": { "type": "string" } } }
  }
}
```

`sanitize_callback` and `auth_callback` are refused: WordPress would run them as code. Need one? Register that key from a [hook](/hooks/) instead. A key that something else registered first for the same post type is skipped, never overwritten. `lps validate` checks all of this before you push.

### REST and custom post types

WordPress only includes meta in the REST response of a post type whose `supports` includes `custom-fields`. `post` and `page` have it. For a post type from `cpt/`, add it:

```json
{
  "supports": ["title", "editor", "custom-fields"],
  "show_in_rest": true
}
```

### Keys starting with `_`

A key starting with `_` (`_internal_ref`) is a protected key: WordPress hides it from the "Custom Fields" box of the editor, which suits keys only code reads. Without an `auth_callback`, which a file can't hold, it can be read through REST but not written through it.

## In wp-admin

The **Config** tab of the Loopress admin page lists the registered meta keys per post type, read-only: key, post type, type, source, and whether it's in REST. A Loopress key skipped because it was already registered shows a **Conflict** badge. A key with the same name as an ACF field shows an **ACF field** badge, for information only: it changes nothing.

:::note
Values are out of scope by design: a key is structure, its values are content. Syncing chosen values between environments may come later as an opt-in.
:::
