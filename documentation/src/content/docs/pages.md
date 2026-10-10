---
title: Static Pages
description: Version-control hand-written HTML pages, and your block theme's templates and parts, and push them to WordPress.
edition: full
---

A static page is a plain `.html` file in your project's `pages/` directory. `lps page push` turns each file into a WordPress page (`post_type=page`) whose slug is the file name: `pages/legal-notice.html` becomes `/legal-notice/` on a site using pretty permalinks, or a `?page_id=` URL on Plain permalinks. Either way, use the URL `lps page list` reports rather than assuming the pretty form. The page is rendered inside your active theme, header and footer included, classic and block themes alike.

`pages/home.html` is the exception: it becomes the site's **front page**, served at `/`. Once its `status` is `publish`, pushing it sets **Settings > Reading** to "A static page" with this page as the homepage, replacing whatever the site showed there before (its latest posts, or another page), and the push says so. A `draft` `home.html` is pushed like any other page but never becomes the front page, so visitors never land on an unpublished home. Switching it back to `draft` while it's the front page reverts the site to showing its latest posts.

The file is the only source of truth. A page pushed by Loopress can no longer be edited in wp-admin, so what's in Git is always what's on the site.

## File format

```html
<!--
title: Legal notice
status: publish
-->
<section class="legal">
  <h1>Legal notice</h1>
  <p>...</p>
</section>
```

The file may start with an HTML comment of `key: value` lines. It stays valid HTML, so you can open the file in a browser to preview it. The header is removed from what gets pushed.

| Key | Default | Description |
|-----|---------|-------------|
| `title` | Derived from the slug (`legal-notice` → `Legal notice`) | The page title, used by the theme and in `<title>`. |
| `status` | `draft` | `draft` or `publish`. Declarative: switching a published page back to `draft` unpublishes it on the next push. |
| `full-width` | `false` | `true` or `false`. On a block theme, drops the theme's max-width and side padding for this page's content only, including the padding of the template's own wrappers around it (header and footer keep theirs). Horizontal only: the space the template leaves above and below the content stays, use your own [page template](#templates-and-parts) to remove it. Silent no-op on a classic (non-block) theme. |
| `hide-title` | `false` | `true` or `false`. Hides the theme's own page title block, useful when your HTML already has its own heading. Same block-theme-only scope as `full-width`. |
| `template` | Theme default | A template slug the active theme offers for pages: one it ships (a block theme's `templates/<slug>.html`, or a classic theme's `page-<slug>.php`), or one of your own [templates](#templates-and-parts). WordPress refuses an unknown slug, and the push of that page fails with `Invalid page template`. |

Any other key, or any other status, is rejected before anything is sent to WordPress, so a typo never silently falls back to a default.

File names must be lowercase letters and digits separated by single hyphens (`legal-notice.html`, not `-legal--notice.html`): WordPress would rewrite such a slug and the page would no longer match its file. Only `.html` files are allowed in `pages/` (dotfiles such as `.DS_Store` are ignored), and subdirectories are not supported yet: one file per page, at the top of the directory. A file that breaks any of these rules stops the whole push before any network call.

The directory is `pages/` by default, set `pageDir` in [`loopress.json`](/loopress-json/#resource-directories) to change it.

## Templates and parts

On a block theme, your project can also version the theme's templates and template parts, as `.html` files of block markup (what the Site Editor saves): `theme/templates/<slug>.html` and `theme/parts/<slug>.html`, next to the [Global Styles](/theme-styles/) file.

`lps theme template push` writes them as the files of a **child theme** of your block theme, named after it with a `-loopress` suffix: `twentytwentyfive-loopress`, "Twenty Twenty-Five Loopress". That's the way WordPress expects a site to override a theme: the parent theme stays untouched and keeps receiving its updates, and everything the child doesn't override still comes from the parent.

```
theme/templates/single.html        → twentytwentyfive-loopress/templates/single.html
theme/templates/bare-landing.html  → twentytwentyfive-loopress/templates/bare-landing.html
theme/parts/header.html            → twentytwentyfive-loopress/parts/header.html
```

- **Any template of the [template hierarchy](https://developer.wordpress.org/themes/templates/template-hierarchy/)**: `single`, `single-post`, `archive`, `category-news`, `taxonomy-download_tag`, `page-no-title`... WordPress resolves the name. Override a parent template by using its name, or add your own.
- **Your own page templates**: a template with a header becomes a custom template a page can pick with its `template` header:

  ```html
  <!-- theme/templates/bare-landing.html -->
  <!--
  title: Bare landing
  postTypes: page
  -->
  <!-- wp:group {"tagName":"main"} -->
  <main class="wp-block-group"><!-- wp:post-content /--></main>
  <!-- /wp:group -->
  ```

  ```html
  <!-- pages/launch.html -->
  <!--
  status: publish
  template: bare-landing
  -->
  <section class="hero">...</section>
  ```

  This one has no header or footer part, so `launch` renders as a bare page.
- **Header keys.** Templates: `title` (the name in the template picker) and `postTypes` (comma-separated, `page` by default). Parts: `title` (derived from the slug) and `area` (`header` for `header` or `header-*`, `footer` for `footer` or `footer-*`, `uncategorized` otherwise). Loopress turns them into the child's `theme.json` (`customTemplates`, `templateParts`), keeping the parent's own entries. A file that opens on a block (`<!-- wp:... -->`) has no header.
- **No `theme` attribute on a template part.** `<!-- wp:template-part {"slug":"header","theme":"twentytwentyfive"} /-->` makes WordPress load the parent's header and ignore yours, so the push refuses it. Write `{"slug":"header"}`.
- **The child mirrors the project.** Every push rewrites it whole: a file you delete locally is removed from the child, and the parent's version comes back.
- **Loopress never activates the child.** Switching themes moves every per-theme setting (menu locations, logo, widgets, Global Styles), so it stays your call: activate it once in **Appearance > Themes**. Until then, the push warns that nothing changed on the site.
- **Edits made in the Site Editor** are saved by WordPress in the database, and that copy wins over the child's file. They're never overwritten: `lps theme template diff` and `lps diff` report them as drift (`siteEditor: "customized"`), and `lps theme template push` warns about them. Use **Clear customizations** in **Appearance > Editor** to go back to the pushed file.
- **Shortcodes don't see the posts of a Query Loop.** WordPress runs every shortcode of a template once, on the whole file, before it renders any block. A `[price]` inside a `wp:post-template` is replaced before the loop exists, so it shows the value of the page's own post for every item. For a value per item, use a [block binding](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-bindings/) (WordPress 6.5+) registered in a [hook](/hooks/), with `uses_context` so it receives each item's `postId`:

  ```php
  register_block_bindings_source('my/price', [
      'label'              => 'Price',
      'uses_context'       => ['postId'],
      'get_value_callback' => fn(array $args, WP_Block $block) => my_price($block->context['postId']),
  ]);
  ```

  ```html
  <!-- wp:paragraph {"metadata":{"bindings":{"content":{"source":"my/price"}}}} --><p></p><!-- /wp:paragraph -->
  ```

  Dynamic blocks that read the current post when they render work in a loop as they are.
- Requires a block theme as the active theme (or the Loopress child itself). Another child theme can't be extended, WordPress has no grandchild themes.

File names are lowercase letters, digits, `_` and `-`, the characters of a post type or taxonomy slug (`taxonomy-download_tag.html`). Same directory rules as pages otherwise. The directories are `theme/templates/` and `theme/parts/` by default, set `templateDir` and `partDir` in [`loopress.json`](/loopress-json/#resource-directories) to change them. `lps push` pushes templates and parts before pages, so a new page can use a template pushed in the same run.

## Commands

Every command below also accepts the [common flags](/concepts/#common-flags): `--env`, `--json`, and `--yes` where it applies. Pages and templates have no `pull` and no `rollback`: the files in Git are the source of truth.

### `lps page push`

Push every page, or only `SLUG`. Supports `--dry-run`.

```bash
lps page push
lps page push legal-notice
```

---

### `lps page list`

List the pages managed by Loopress on WordPress, with their status and URL.

---

### `lps page diff`

Show what differs (HTML, title, status) between `pages/` and WordPress. Also part of the aggregate [`lps diff`](/workflow/#lps-diff) (`--only page`).

---

### `lps theme template push`

Write every template and part to the Loopress child theme. Supports `--dry-run`.

---

### `lps theme template list`

Show the child theme: active or not, its templates and parts, and those edited in the Site Editor.

---

### `lps theme template diff`

Show what differs between `theme/templates/` + `theme/parts/` and the child theme, Site Editor edits included. Also part of the aggregate [`lps diff`](/workflow/#lps-diff) (`--only template`, `--only part`).

Pages and templates are also part of [`lps push`, `lps diff`, and `lps dev`](/workflow/) (a saved file is pushed to your local environment right away).

When several pages are pushed, each one is pushed on its own: a refused page doesn't stop the others, and the command fails at the end with the number of pages that failed.

## What gets refused

The push is refused, and nothing is written, when:

- a page with the same slug already exists on WordPress but wasn't created by Loopress. Rename your file, or remove that page in wp-admin.
- the Loopress page is in the trash. Restore it manually in wp-admin before pushing it again.
- the slug is already used by another page, a media file, or is reserved by WordPress. WordPress would otherwise rename your page to `about-2` behind your back. Rename your file.
- the HTML is over 512 KB, or all managed pages together are over 8 MB. Both limits can be raised with the `loopress_max_file_bytes` and `loopress_max_files_total_bytes` filters (the second argument is `'pages'`).

## In wp-admin

In **Pages**, a page pushed by Loopress carries a **Managed by Loopress** badge and has no Edit or Quick Edit link: the editor, Quick Edit and bulk edit are closed for it, including its slug, status and template, all of which come from the pushed file instead. You can still:

- add it to a menu;
- move it to the trash. The next push then refuses it until you restore it;
- preview a `draft` page: the **Preview** row action opens the real rendered page, the same read-only check WordPress's own front-end draft preview uses.

Because the editor is closed, the SEO plugin's meta box and the featured image are not reachable for these pages either.

## How it renders, and known limits

The HTML is stored in a hidden post meta, never in the page's regular content (`post_content`, which stays empty). It is inserted through the `the_content` filter, before shortcodes and embeds run, so shortcodes, oEmbed links and image lazy-loading work as on any page. Automatic paragraphs (`wpautop`) are turned off for these pages only, your markup is output as written.

- **Shortcodes from other plugins may lose their styles.** Many plugins decide whether to load their CSS and JS by looking for their shortcode in `post_content`. Since it's empty, the shortcode renders but without its assets on those plugins. Plugins that load their assets from the shortcode itself are not affected.
- **Bare pages need a block theme.** A page is rendered inside its template. For a page without the theme's header and footer, push a [template](#templates-and-parts) that leaves them out. Classic themes have no such option.
- **WordPress search matches a page's title, not its HTML.** Core search includes `post_title`, so a page can turn up by title, but it never matches inside the pushed HTML, since that lives outside `post_content`.
- **Deactivating Loopress** leaves these pages empty between the theme's header and footer. Nothing leaks, and `lps doctor` reports the missing plugin.
- **Pushed HTML is not filtered.** Like [API routes](/api/) and [hooks](/hooks/), anything you push, `<script>` included, runs on the site as is. Pushing requires an administrator (`manage_options`) account.
- There is no `lps page pull` or `lps page rm` yet: to remove a page, trash it in wp-admin and delete its file.
