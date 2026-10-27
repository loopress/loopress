---
title: Dynamic Blocks
description: Version-control server-rendered blocks (block.json + render.php, with their own CSS and JS) and place them in your pages and templates.
edition: full
---

The `block` command group deploys dynamic blocks: a piece of HTML rendered by PHP on every request, with its own attributes, CSS and JS. One folder per block, in WordPress's own block format (`block.json` + `render.php`), registered by the Loopress plugin as `loopress/<slug>`.

## When to use a block

| You need | Use |
|---|---|
| Fixed markup reused on several pages | a [block pattern](/block-patterns/) |
| An interactive React, Vue or Svelte app | a [single-page app](/apps/) |
| To change WordPress's behavior (a filter, an admin column, a cron) | a [hook](/hooks/) |
| HTML built from the database on every request, with its own CSS and JS | a dynamic block |

Compared with a shortcode in a hook, a block:

- **loads its CSS and JS only on pages where it renders**, not site-wide;
- **takes typed attributes**: `<!-- wp:loopress/featured-scenes {"limit":3} /-->`;
- **works inside a Query Loop**: it receives each item's `postId` through its context, where a shortcode only ever sees the page's own post (see [pages](/pages/));
- **lives in one folder**, easy to read and to remove.

`render.php` is PHP that runs on the site, so dynamic blocks are part of Loopress Full, like hooks.

## File format

```
blocks/
  featured-scenes/
    block.json    # required
    render.php    # required
    style.css     # optional, front end and editor
    view.js       # optional, ES module, front end only
```

A block folder holds only these four files. Its name is the block's slug: lowercase letters, digits and hyphens, starting with a letter.

### block.json

The [standard WordPress `block.json`](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/). Its `name` must be `loopress/<folder name>`. Assets are referenced with `file:./`, as in a plugin:

```json
{
  "apiVersion": 3,
  "name": "loopress/featured-scenes",
  "title": "Featured scenes",
  "category": "widgets",
  "attributes": {
    "limit": {"type": "number", "default": 3}
  },
  "usesContext": ["postId"],
  "style": "file:./style.css",
  "viewScriptModule": "file:./view.js"
}
```

Loopress fills in two defaults:

- **`version`**: when you don't set one, the time of the last push, so browsers pick up a new `style.css` or `view.js` right away.
- **`"supports": {"inserter": false}`**: the block is placed in `pages/` and `theme/` files, not picked from the editor's inserter.

A block with no editor script isn't known to the editor at all. To pick it from the inserter, with a server-rendered preview, set `"supports": {"inserter": true, "autoRegister": true}` (WordPress 7.0 and later).

### render.php

The WordPress template contract: `$attributes`, `$content` and `$block` are in scope, and whatever it prints is the block's HTML. No class, no attributes: it's a template, not a hook.

```php
<?php
$scenes = get_posts([
    'post_type'      => 'interactive-scenes',
    'meta_key'       => '_featured',
    'posts_per_page' => $attributes['limit'],
]);
?>
<div <?= get_block_wrapper_attributes(['class' => 'featured-scenes']) ?>>
    <?php foreach ($scenes as $scene): ?>
        <a href="<?= esc_url(get_permalink($scene)) ?>"><?= esc_html(get_the_title($scene)) ?></a>
    <?php endforeach; ?>
</div>
```

Inside a Query Loop, `$block->context['postId']` is the current item (declare `"usesContext": ["postId"]` in `block.json`).

A helper shared by several blocks belongs in a [hook](/hooks/) file: hooks load before blocks register.

### style.css and view.js

Plain files, served as they are. Loopress doesn't build anything: a block that needs a bundler builds before `lps block push`. `view.js` is loaded as an ES module on the pages where the block renders. It can't import WordPress script modules such as `@wordpress/interactivity`: a block folder has no `view.asset.php` to declare them.

## Typical workflow

```bash
# 1. Write the block (block.json and render.php above)
mkdir -p blocks/featured-scenes

# 2. Place it in a template or a page
cat >> theme/templates/archive-interactive-scenes.html <<'EOF'
<!-- wp:loopress/featured-scenes {"limit":3} /-->
EOF

# 3. Commit and deploy (lps push sends blocks before templates and pages)
git add blocks/ theme/ && git commit -m "feat: featured scenes block"
lps block push && lps theme template push
```

## Errors never break the page

- **A block that can't load** (invalid `block.json`, a `name` that isn't `loopress/<slug>`, a name another plugin already registered) is skipped. `lps block list` shows why.
- **A `render.php` that throws** renders nothing in place of the block, the rest of the page renders normally. The error is logged, and `lps block list` shows the last one until the block is pushed again.

`lps block push` checks every folder first (required files, `name`, every `file:./` path exists), and the site refuses a `render.php` with a PHP syntax error, so most mistakes never reach the site. `lps validate` runs the same local checks.

## Commands

Every command below also accepts the [common flags](/concepts/#common-flags): `--env`, `--json`, and `--yes` where it applies.

| Command | What it does |
|---------|--------------|
| `lps block push [path]` | Create or update each block from `blocks/<slug>/`, each one replaced as a whole. Never deletes a block. Refused if the block changed on WordPress since your last push. |
| `lps block pull [path]` | Write the blocks Loopress manages to `blocks/<slug>/`. Local blocks no longer on WordPress are removed, see [pull mirrors the site](/concepts/#pull-mirrors-the-site). |
| `lps block list` | The blocks Loopress registers, with their load and render errors. |
| `lps block rm <slug>` | Remove a block from WordPress. A `wp:loopress/<slug>` left in a page or template renders nothing until it's pushed again: the command warns when your `pages/`, `theme/templates/`, `theme/parts/` or `patterns/` files still use it. Local files are left alone. |
| `lps block diff [path]` | What differs between `blocks/` and an environment, or two environments with `--against`. Also part of [`lps diff`](/workflow/#lps-diff) (`--only block`). |
| `lps block rollback` | Restore the snapshot saved before an earlier push, see [Rollback and Snapshots](/rollback/). |

The folder is `blocks/` by default, `blockDir` in [`loopress.json`](/loopress-json/) changes it.

## Not supported

- **Static blocks** (a `save()` function in JS): their HTML is frozen into the content, a [block pattern](/block-patterns/) does the same with less.
- **A custom editor UI** (`editorScript`, an `edit()` function): at most the server-rendered preview `autoRegister` gives. Loopress pages and templates are written as files, not edited in wp-admin.
