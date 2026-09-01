---
title: Ship a Vue or React App Into a WordPress Page
description: Single-page apps let you version-control a built Vue, React or Svelte bundle alongside the rest of your WordPress config, ship it over the REST API, and mount it in a page with a shortcode. No plugin, no FTP.
date: 2026-08-31
draft: true
authors:
  - maxime
tags:
  - single-page apps
  - vue
  - react
  - git
  - wordpress
excerpt: You built a real search UI as a Vue app. Now it has to live inside a WordPress page. The usual answers are a throwaway plugin or a pasted script tag. Loopress Full gives you a third one.
---

You built a proper single-page app: a product finder, a plan configurator, a search UI with filters. Vite, a framework, a real component tree. It talks to `wp-json` and renders its own thing. It is done.

Now it has to end up inside a WordPress page. Where does the built `dist/` folder go?

## Where a built bundle lives today

**A Custom HTML block.** Paste a `<script src="...">` and a `<div id="app">`. Works once. The bundle sits in the Media Library or on a CDN, the filename never changes so every new build is a cache fight, and nothing about it is in your repo. Roll back? Re-upload the old files by hand.

**A site-specific plugin.** The clean answer, and now your 200 KB of JavaScript comes wrapped in a plugin header, a `wp_enqueue_script` call with a version string you bump yourself, a shortcode registration, and some way to get the built files onto the server: FTP, rsync, a deploy script. Every rebuild is a re-upload.

**A page builder's "custom code" widget.** The HTML block again, with more markup around it and a lock-in tax.

The app was the work. Getting its output onto the site, versioned, cache-busted, and rollback-able, is the part with no good answer.

## One directory, one command

With [Loopress Full](/wordpress-plugin/), a single-page app is a directory in your repo:

```
apps/
  search/
    loopress.app.json      # a few optional settings, all with defaults
    dist/                   # your build output, untouched
      index.html
      assets/index-9a597e0d.js
      assets/index-51910369.css
```

Build it with its own toolchain, then push:

```bash
npm --prefix apps/search run build
lps app push search
```

`push` hashes every file in `dist/`, asks the site which ones it already has, uploads only the difference, then commits the new build in one step. The front end keeps serving the previous build until that commit lands, so a deploy is atomic: there is no window where half the new assets are live and half are not.

Mount it in any page, post, or template with a shortcode:

```
[loopress_app name="search"]
```

That enqueues the build's content-hashed entry files and prints the element your app mounts on:

```html
<div id="loopress-app-search" data-loopress-app="search"></div>
```

Loopress ships the build output. It does not run the build: you, or your CI, run `npm run build`, and Loopress syncs the result. Same lane as every other Loopress command, a REST bridge between a Git repo and WordPress.

## Talking back to WordPress

The shortcode drops a small config object on the page, `window.loopressApp_search` (hyphens in the name become underscores):

```js
{
  name: 'search',
  mount: '#loopress-app-search',
  base: 'https://example.com/wp-content/loopress/apps/search/',
  buildId: '9f2a1c7b4e10',
  restUrl: 'https://example.com/wp-json/',
  restNonce: 'a1b2c3d4e5',
}
```

`restUrl` and `restNonce` are there so the app can call the site as the current visitor. Pair them with a [Custom API Route](/blog/custom-wordpress-endpoint-without-writing-a-plugin/) for the actual search endpoint, and both halves of the feature, the UI and the API it calls, are files in the same repo, deployed by the same CLI.

`base` is the absolute URL the bundle is served from, for resolving a `public/` asset your bundler did not rewrite (`base + 'flags/fr.svg'`).

## Deploy like the rest of your config

```bash
lps app pull                        # mirror what's deployed into apps/
git checkout -b tweak-search
# edit, rebuild, review the diff
lps app push search                 # to staging
lps app push search --env production --yes
```

`pull` writes each deployed app back to `apps/<name>/dist/` and removes local app directories whose app no longer exists on the site, so the folder mirrors what is live. `push` never deletes anything on WordPress: a build that fails to upload leaves the previous one serving.

## The constraints, up front

This is an MVP, and it does one thing:

- **Hash routing only.** `vue-router` and React Router must run in hash mode (`/page#/results`). History-mode routing needs a server rewrite that would collide with WordPress permalinks, so it is refused rather than half-supported.
- **Static assets only.** `.php` and other server-executable files are rejected on push. The bundle is served straight off `wp-content/`.
- **One generation of grace, no history.** The immediately previous build is kept so a visitor mid-session does not 404 on a lazy chunk. Older builds are deleted. There is no rollback command and no version list: to roll back, rebuild from an earlier commit and push again.
- **One deploy at a time per app.** The asset upload and the state write are separate steps, so a pipeline should run one `lps app push` per app at a time. That is the normal case anyway.
- **8 MB per file** (raise it with a filter). A typical search-page bundle is 1 to 3 MB total.

## When this is the right tool

A self-contained interactive surface inside an otherwise ordinary WordPress site: a product finder, a plan configurator, a map with filters, a booking flow, an internal dashboard behind login. You want it in Git, you want it deployable, and you do not want it to be a plugin.

If the whole front end is a SPA and WordPress is purely headless, this is not it: serve that from its own host. This is for dropping one built app into one page.

---

Single-page apps ship with Loopress Full, the free full edition of the plugin:

```bash
npm install -g @loopress/cli
```

The [documentation](/apps/) covers `loopress.app.json`, entry-file resolution, and the full `lps app pull/push/list/remove` reference.
