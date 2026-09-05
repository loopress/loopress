---
title: Embed a React App in a WordPress Page With One Shortcode
description: Build a single-page app with your own toolchain, ship the bundle to WordPress with the Loopress CLI, and mount it with a shortcode. A real product-search widget, start to finish.
date: 2026-09-05
draft: false
cliVersion: 0.23.0
wordpressPluginVersion: 2026.7.16
authors:
  - maxime
tags:
  - spa
  - react
  - wordpress
  - javascript
excerpt: Most "SPA in WordPress" setups fall apart on the second deploy. Here's how to ship a real React widget to a WordPress page, with content-hashed cache busting and one shortcode, using the `lps app` commands.
---

You want a real front-end app inside a WordPress page. A live product search, a booking widget, an interactive configurator, something React or Vue does well and PHP templates don't. The moment you try to actually ship it, you hit a wall: WordPress wasn't built to serve a Vite or webpack bundle, and every workaround feels like it fights the platform.

## How people try to solve this today

**Option 1: Paste the build into the theme**
Copy `dist/assets/*.js` into the theme, hand-edit `functions.php` to enqueue them. It works once. Then you rebuild, the filenames change (content hashes), and you're back in `functions.php` updating script tags by hand. Switch themes and the app disappears.

**Option 2: An iframe pointing at a separately hosted app**
Deploy the SPA to Vercel or Netlify, embed it with an `<iframe>`. No PHP to touch, but now you're running two deployments for one feature, styling is boxed off from the rest of the page, and calling WordPress data from the iframe means solving CORS and auth across two domains for no real reason.

**Option 3: A custom plugin that hardcodes `wp_enqueue_script`**
Better than editing the theme, it survives a theme switch. But every new build still means editing PHP, bumping a version string by hand, and redeploying the plugin. There's no local dev loop, no diff, no easy way to push the same build to staging before production.

None of these give you the thing you actually want: build the app with its own toolchain, ship the output like you'd ship any other code, mount it with one line.

## The Loopress approach

Loopress treats a built SPA as one more thing that syncs between your Git repo and WordPress, the same way it treats snippets or custom API routes. You build, Loopress ships the `dist/` folder over the REST API and gives you a shortcode to mount it. This is a [Loopress Full](/wordpress-plugin/) feature.

### Setup

```bash
npm install -g @loopress/cli
lps project config
```

`lps project config` asks for your WordPress URL and handles authentication (an Application Password, created automatically via your browser or entered manually).

### A real example: a live product search widget

Say you run a WooCommerce shop and want an instant search box on a page: type a few letters, see matching products appear below without a page reload. A small React app is a better fit for that than a PHP template re-render on every keystroke.

The directory layout:

```
apps/
  search/
    loopress.app.json
    dist/                       # npm run build output, this is what gets pushed
      index.html
      assets/
        index-9a597e0d.js
        index-51910369.css
```

`loopress.app.json` can be empty, `{}`. Loopress derives the app's name from the directory, reads the entry scripts and styles straight from `dist/index.html`, and defaults the mount point to `#loopress-app-search`.

Build it with its own toolchain, exactly like any other front-end project:

```bash
npm --prefix apps/search run build
```

### Push it

```bash
lps app push search
```

```
Pushing apps to https://example.com
Apps path: apps
Found 1 app to push
search: uploaded 3 files, committed build 9f2a1c7b4e10
All apps pushed.
```

Only files whose content changed are uploaded, then the whole build is committed in one atomic step. The site keeps serving the previous build until that commit lands, so a failed push never leaves a half-deployed app.

Want to see what would happen first?

```bash
lps app push search --dry-run
```

```
[dry-run] search: would upload 3 files, then commit build 9f2a1c7b4e10
```

### Mount it

Drop the shortcode into any page or post:

```
[loopress_app name="search"]
```

WordPress renders the mount point and enqueues the content-hashed entry files with the build id as the cache-busting version:

```html
<div id="loopress-app-search" data-loopress-app="search"></div>
```

### Wire it to real WooCommerce data

The shortcode also exposes a small config object your app reads at runtime, `window.loopressApp_search`:

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

Pair that with a [custom API route](/api/) for the search endpoint itself. A minimal one, public since anonymous shoppers need to search too:

```php
<?php
// api/search-products.php
declare(strict_types=1);

class SearchProducts
{
    public function permission(): bool
    {
        return true;
    }

    public function get(WP_REST_Request $request): array
    {
        $query = new WP_Query([
            'post_type' => 'product',
            's' => sanitize_text_field((string) $request->get_param('q')),
            'posts_per_page' => 10,
        ]);

        return array_map(
            static fn ($post) => [
                'id' => $post->ID,
                'name' => $post->post_title,
                'price' => get_post_meta($post->ID, '_price', true),
                'url' => get_permalink($post->ID),
            ],
            $query->posts,
        );
    }
}
```

```bash
lps api push
```

The React app fetches `restUrl + 'loopress-api/v1/search-products?q=...'` on every keystroke, with the `restNonce` header for authenticated calls if you need it later. Two independently deployable pieces, one page.

### Checking what's live

```bash
lps app list
```

```
Apps (1):
  search
     Build:  9f2a1c7b4e10
     Files:  22 files, 2.44 MB
     Deployed: 2026-08-30T12:00:00+00:00
```

### Pulling it back down

New machine, or a teammate joining the project:

```bash
lps app pull
```

```
Pulling apps from https://example.com
Apps path: apps
  search: 22 files (build 9f2a1c7b4e10)
Pulled 1 app to apps
```

### Decommissioning it

```bash
lps app remove search
```

Deletes the bundle from `wp-content/loopress/apps/` and unregisters the shortcode. Local files are untouched, only the WordPress side is cleaned up.

## Working across environments

Same pattern as everything else in Loopress: register each environment once with `lps project config`, then target one with `--env`.

```bash
# ship to staging first
lps app push search --env staging

# looks right, ship to production
lps app push search --env production --yes
```

`--yes` is required outside a terminal (CI, scripts) because pushing to an environment named `production` asks for confirmation first.

## Things to keep in mind

- **Hash routing only.** `react-router` or `vue-router` must run in hash mode (`/page#/route`). History-mode routing needs a server rewrite that would collide with WordPress permalinks, so it's refused rather than half-supported.
- **One generation of grace, no rollback.** On deploy, the previous build's files are kept for one generation so a visitor mid-session doesn't 404 on a lazy chunk. There's no version history beyond that, so treat Git as your rollback mechanism, not WordPress.
- **Content-hashed filenames are required.** Vite and webpack do this by default. It's what makes a new deploy bust every visitor's cache safely.

---

If you have a front-end app that belongs inside a WordPress page instead of bolted on beside it, the next step is `apps/<name>/dist` and `lps app push`.
