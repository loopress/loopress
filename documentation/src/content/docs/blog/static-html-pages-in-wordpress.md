---
title: A Hand-Written HTML Page in WordPress, Without Fighting the Block Editor
description: Some pages are better written as HTML than assembled in Gutenberg. Loopress pushes a plain .html file from your repo as a real WordPress page, rendered by your theme, and locks it in wp-admin so Git stays the source of truth.
date: 2026-11-05
draft: true
cliVersion: 0.26.0
wordpressPluginVersion: 2026.11.0
authors:
  - maxime
tags:
  - pages
  - html
  - git
  - wordpress
excerpt: A landing page designed in code, a legal notice your lawyer sends as a diff, a pricing table with markup the block editor keeps "fixing". Write it as an HTML file, push it, and WordPress renders it inside your theme like any other page.
---

There's a kind of page every developer has fought the block editor over. A landing page with a precise layout. A pricing table with markup that has to be exactly this. A legal notice where every change should be traceable, because a lawyer asked for it.

The usual escape hatches all leak. A Custom HTML block works until someone opens the page and the editor "recovers" your markup. A page template in the theme means a theme deploy for a copy change. Pasting HTML into the code editor works once, and the next edit happens in production with no history.

## A page is a file

With [Loopress Full](/wordpress-plugin/), a page can be a plain `.html` file in your repo:

```html title="pages/legal-notice.html"
<!--
title: Legal notice
status: publish
hide-title: true
-->
<section class="legal">
  <h1>Legal notice</h1>
  <p>Published by Example Ltd, registered in...</p>
</section>
```

```bash
lps page push
```

That creates a regular WordPress page (`post_type=page`) whose slug is the file name, so `legal-notice.html` becomes `/legal-notice/` on a site with pretty permalinks. It's rendered inside your active theme, header and footer included, classic or block theme. `lps page list` prints each page's real URL, which is the one to trust on a site with plain permalinks.

The header comment is optional and stays valid HTML, so you can open the file straight in a browser to preview it. It's stripped before anything is pushed:

| Key | What it does |
|-----|--------------|
| `title` | The page title. Defaults to one derived from the slug. |
| `status` | `draft` (the default) or `publish`. Switching back to `draft` unpublishes the page on the next push. |
| `hide-title` | Hides the theme's own title block when your HTML has its own heading (block themes). |
| `full-width` | Drops the theme's content width for this page only (block themes). |
| `template` | Any template the active theme ships. |

An unknown key or status stops the push before any network call, so a typo like `stauts: publish` can't quietly leave a page in draft.

## Git is the only way in

Here's the decision that makes this work: once Loopress has pushed a page, **it can no longer be edited in wp-admin**. The page list shows a *Managed by Loopress* badge, and the editor, Quick Edit, and bulk edit are all closed for it, slug, status, and template included.

That can sound heavy-handed. It's the only way the file stays true. A page that can be edited both in Git and in the browser has two sources of truth, and the next push silently erases whichever edit happened in the browser. Locking the page removes the question.

Editors can still do what they need around it: add it to a menu, preview a draft, or trash it (after which the next push refuses to recreate it until someone restores it, so a deletion is never undone by accident).

## Refused before anything is written

A push stops, with nothing written, when:

- a page with that slug already exists but wasn't created by Loopress. Your file never takes over someone's hand-built page.
- the slug is used by another page or a media file, or reserved by WordPress. Otherwise WordPress would quietly rename yours to `legal-notice-2`, and the file and the page would stop matching.
- the file name isn't lowercase letters and digits joined by single hyphens, for the same reason.
- the HTML is over 512 KB.

When several pages are pushed, each one goes on its own: one refused page doesn't block the others, and the command fails at the end with the count.

## How it renders, and what that implies

The HTML isn't stored in the page's `post_content`, which stays empty. It lives in a hidden post meta and is inserted through the `the_content` filter, before shortcodes and embeds run. So shortcodes, oEmbed links, and lazy-loaded images work, and `wpautop` is turned off for these pages only: your markup comes out as written, with no stray `<p>` tags.

The same choice has trade-offs worth knowing before you migrate a page:

- **Some shortcodes lose their styles.** Plenty of plugins decide whether to enqueue their CSS by searching `post_content` for their shortcode. It's empty here, so the shortcode renders without its assets.
- **Site search matches the title, not the body.** WordPress search reads `post_content`.
- **The pushed HTML is not filtered.** Anything you push runs as-is, `<script>` included. That's what you want from a file in a reviewed repo, and it's why pushing requires an administrator account.
- **Deactivating Loopress** leaves these pages empty between the theme's header and footer.

## Where it fits

Static pages sit next to the rest of your repo's WordPress configuration: part of `lps push`, of `lps diff` (HTML, title, and status are all compared), and of `lps dev`, which pushes a saved file to your local environment as you type. The pages that need to be exactly right get the same review and history as your code. Everything else stays in the block editor, where editors are happiest.

---

```bash
npm install -g @loopress/cli
```

Static pages are a [Loopress Full](/wordpress-plugin/) feature. The [Static Pages reference](/pages/) covers the file format and every refusal rule.
