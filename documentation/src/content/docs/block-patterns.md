---
title: Block Patterns
description: Version-control block patterns as HTML files and include them in your pages, templates and parts, so one change updates every page that uses them.
edition: full
---

The `pattern` command group declares block patterns in code. A pattern is a group of blocks written once (a hero, a pricing table, a call to action), one `.html` file per pattern, registered by the Loopress plugin as `loopress/<slug>` on every request.

## Reference, not copy

WordPress offers two ways to use a pattern, and they behave very differently:

- **Inserted from the editor**, a pattern is **copied**: its blocks are pasted into the post, with no link to the pattern anymore. Updating the pattern changes nothing in that post. That's by design for starting layouts editors customize afterwards.
- **Referenced** with a `wp:pattern` block, it is **rendered on every request**: updating the pattern updates every page that references it, without pushing those pages again.

```html
<!-- wp:pattern {"slug":"loopress/hero"} /-->
```

Write that line in a [static page](/pages/), a block template or a template part. [Static pages](/pages/) can't be opened in the WordPress editor, so the reference can never be turned into a copy behind your back: the pattern behaves like an include.

:::caution
Pasting the pattern's blocks into a page instead of the `wp:pattern` line gives you a copy, with no link to the pattern.
:::

Pattern content is HTML that can carry a `<script>`, so block patterns are part of Loopress Full, like static pages.

## Typical workflow

```bash
# 1. Write a pattern
mkdir -p patterns && cat > patterns/hero.html <<'EOF'
<!--
title: Hero with call to action
categories: banner, call-to-action
-->
<!-- wp:cover {"dimRatio":50} -->
<div class="wp-block-cover"><span aria-hidden="true" class="wp-block-cover__background has-background-dim"></span><div class="wp-block-cover__inner-container">
<!-- wp:heading {"level":1} --><h1 class="wp-block-heading">Build faster</h1><!-- /wp:heading -->
</div></div>
<!-- /wp:cover -->
EOF

# 2. Reference it from a page
cat > pages/landing.html <<'EOF'
<!--
title: Landing
status: publish
-->
<!-- wp:pattern {"slug":"loopress/hero"} /-->
EOF

# 3. Commit and deploy (lps push sends patterns before pages)
git add patterns/ pages/ && git commit -m "feat: hero pattern on the landing page"
lps pattern push && lps page push
```

From now on, `lps pattern push` alone updates the hero on the landing page.

## Commands

Every command below also accepts the [common flags](/concepts/#common-flags): `--env`, `--json`, and `--yes` where it applies. They work exactly like their [`lps cpt`](/custom-post-types/#commands) counterparts.

| Command | What it does |
|---------|--------------|
| `lps pattern push [path]` | Create or update each pattern from `patterns/*.html`. Never deletes a pattern. Refused if the pattern changed on WordPress since it was last read. |
| `lps pattern pull [path]` | Write the patterns Loopress manages to `patterns/<slug>.html`. Patterns from the theme or a plugin are never pulled. Local files no longer on WordPress are removed, see [pull mirrors the site](/concepts/#pull-mirrors-the-site). |
| `lps pattern list` | The patterns registered by Loopress, the theme and plugins. WordPress core's own patterns are left out. |
| `lps pattern rm <slug>` | Stop registering a Loopress pattern. A `wp:pattern` reference to it renders nothing until it's pushed again, copies already inserted in posts stay. The local file is left alone. Asks for confirmation, `--yes` skips it. |
| `lps pattern diff [path]` | What differs between `patterns/` and an environment, or two environments with `--against`. Also part of [`lps diff`](/workflow/#lps-diff) (`--only pattern`). |
| `lps pattern rollback` | Restore the snapshot saved before an earlier push, see [Rollback and Snapshots](/rollback/). |

## File format

```
patterns/
  hero.html
  pricing-table.html
```

The file name is the pattern's slug, registered as `loopress/<slug>`: 1 to 100 lowercase letters, digits, `_` or `-`. The file is block markup, optionally opened by the same comment header as [static pages](/pages/):

| Header key | Value |
|------------|-------|
| `title` | The name shown in the inserter. Defaults to the slug (`pricing-table` becomes "Pricing table"). |
| `description` | A short description, shown in the inserter |
| `categories` | Comma-separated [pattern categories](https://developer.wordpress.org/themes/patterns/registering-patterns/#pattern-categories) (`banner`, `call-to-action`, `text`, `gallery`...). An unknown category files it under "Uncategorized". |
| `keywords` | Comma-separated search keywords |
| `block-types` | Comma-separated blocks the pattern can replace (`core/template-part/header`) |
| `post-types` | Comma-separated post types the pattern is offered for |
| `template-types` | Comma-separated template types the pattern is offered for |
| `viewport-width` | The preview width, in pixels |
| `inserter` | `false` hides it from the inserter, useful for a pattern only meant to be referenced |

An unknown header key is refused, so a typo never goes unnoticed. `lps validate` checks every file before you push.

Synced patterns (WordPress's `wp_block` posts, formerly "reusable blocks") are out of scope: in a static page, a referenced pattern already updates everywhere.
