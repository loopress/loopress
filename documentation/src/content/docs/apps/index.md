---
title: Single-page apps
description: Ship a pre-built Vue, React or Svelte bundle to WordPress and mount it into any page with a shortcode.
---

Single-page apps let you version-control a front-end application (Vue, React, Svelte, anything that builds to static files) alongside the rest of your WordPress config, ship its built output to the site over the REST API, and drop it into a page with a shortcode.

This is a [Loopress Full](/wordpress-plugin/) feature, not available in Loopress Light.

Loopress ships the **build output**, it does not run the build. You (or your CI) run `npm run build`; Loopress syncs the resulting `dist/` folder and gives you a mount helper. That keeps it in the same lane as every other Loopress command: the REST bridge between a Git repo and WordPress.

## How it fits together

```
apps/
  search/
    loopress.app.json      # a few optional settings
    dist/                  # your build output, this is what gets pushed
      index.html
      assets/
        index-9a597e0d.js
        index-51910369.css
```

```bash
# 1. build the app with its own toolchain
npm --prefix apps/search run build

# 2. ship the bundle to WordPress (only changed files are uploaded)
lps app push search

# 3. mount it in a page
[loopress_app name="search"]
```

The shortcode enqueues the app's content-hashed entry files and prints the mount point the SPA attaches to:

```html
<div id="loopress-app-search" data-loopress-app="search"></div>
```

## `loopress.app.json`

Every field is optional.

| Field | Default | Notes |
|-------|---------|-------|
| `name` | the directory name | lowercase letters, digits and hyphens |
| `assetsDir` | `dist` | build output directory, relative to the app directory |
| `mountSelector` | `#loopress-app-<name>` | the element id the shortcode renders and your app mounts on |
| `routing` | `hash` | only `hash` is supported (see below) |
| `entry` | read from `dist/index.html` | `{ "scripts": [...], "styles": [...] }`, only needed when there is no `index.html` |

## Constraints

- **Hash routing only.** `vue-router` / React Router must run in hash mode (`/page#/route`). History-mode routing needs a server rewrite rule that would collide with WordPress permalinks and other plugins, so it is refused for now rather than half-supported.
- **Content-hashed filenames.** Vite and webpack do this by default (`index-9a597e0d.js`). It is what makes a new deploy bust every cache; the enqueue version is also set to the build id.
- **Static assets only.** `.php` and other server-executable files are rejected on push: the bundle is served straight off `wp-content/`.
- **Per-file size limit.** A single file over 8 MB is rejected (raise it with the `loopress_app_max_asset_bytes` filter). A typical search-page bundle is 1 to 3 MB total and well under this.
- **One generation of grace.** On deploy, files from the immediately previous build are kept so a visitor mid-session does not 404 on a lazy chunk. Older builds are removed. There is no rollback or version history.
- **One deploy at a time per app.** Concurrent `lps app push` (or a push racing a `lps app remove`) for the *same* app are not serialized: the asset cleanup and the state write are separate steps. Deploys of different apps are independent. Run one push per app at a time, which is the normal case for a CI pipeline.
- **Not part of `lps push`.** Apps need their build step to run first, so the aggregate `lps push` / `lps pull` / `lps promote` commands leave them alone. Deploy with `lps app push`.

## Talking to WordPress from the app

The shortcode exposes a small config object on the page, named `loopressApp_<name>` (hyphens become underscores):

```js
// window.loopressApp_search
{
  name: 'search',
  mount: '#loopress-app-search',
  base: 'https://example.com/wp-content/loopress/apps/search/',
  buildId: '9f2a1c7b4e10',
  restUrl: 'https://example.com/wp-json/',
  restNonce: 'a1b2c3d4e5',
}
```

`base` is the absolute URL the bundle is served from: use it to resolve a `public/` asset referenced from rendered markup (`base + 'icon.svg'`) that the bundler does not rewrite. Pair `restUrl` / `restNonce` with a [custom API route](/api/) for the search endpoint itself.

## Pages

- [CLI](/apps/cli/): the `lps app pull/push/list/remove` commands
