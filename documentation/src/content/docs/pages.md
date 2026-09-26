---
title: Static Pages
description: Version-control hand-written HTML pages and push them to WordPress as regular pages rendered by your theme.
---

:::note
Static pages are a [Loopress Full](/wordpress-plugin/) feature, not available in Loopress Light.
:::

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
| `full-width` | `false` | `true` or `false`. On a block theme, drops the theme's max-width/side-padding for this page's content only (header and footer keep theirs). Silent no-op on a classic (non-block) theme. |
| `hide-title` | `false` | `true` or `false`. Hides the theme's own page title block, useful when your HTML already has its own heading. Same block-theme-only scope as `full-width`. |
| `template` | Theme default | Any template slug the active theme ships (a block theme's `templates/<slug>.html`, or a classic theme's `page-<slug>.php`). Not validated: an unknown slug just falls back to the default template, WordPress never errors on it. |

Any other key, or any other status, is rejected before anything is sent to WordPress, so a typo never silently falls back to a default.

File names must be lowercase letters and digits separated by single hyphens (`legal-notice.html`, not `-legal--notice.html`): WordPress would rewrite such a slug and the page would no longer match its file. Only `.html` files are allowed in `pages/` (dotfiles such as `.DS_Store` are ignored), and subdirectories are not supported yet: one file per page, at the top of the directory. A file that breaks any of these rules stops the whole push before any network call.

The directory is `pages/` by default, set `pageDir` in [`loopress.json`](/cli/init/#fields-reference) to change it.

## Commands

| Command | Description |
|---------|-------------|
| `lps page push [SLUG]` | Push every page, or only `SLUG`. Supports `--dry-run` and `--yes`. |
| `lps page list` | List the pages managed by Loopress on WordPress, with their status and URL. |
| `lps page diff` | Show what differs (HTML, title, status) between `pages/` and WordPress. Also available as `lps diff --only page`. |

Pages are also part of `lps push`, `lps diff`, and `lps dev` (a saved file is pushed to your local environment right away).

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
- **No bare page.** A page is always rendered inside your theme's layout. A page without the theme's header and footer is not supported yet.
- **WordPress search matches a page's title, not its HTML.** Core search includes `post_title`, so a page can turn up by title, but it never matches inside the pushed HTML, since that lives outside `post_content`.
- **Deactivating Loopress** leaves these pages empty between the theme's header and footer. Nothing leaks, and `lps doctor` reports the missing plugin.
- **Pushed HTML is not filtered.** Like [API routes](/api/) and [hooks](/hooks/), anything you push, `<script>` included, runs on the site as is. Pushing requires an administrator (`manage_options`) account.
- There is no `lps page pull` or `lps page rm` yet: to remove a page, trash it in wp-admin and delete its file.
