---
title: Headless WordPress Sitemap for a Next.js or Astro Frontend
description: A Custom API Route that returns an XML sitemap with your frontend's own domain, built from WordPress posts and pages, since wp-sitemap.xml lists the CMS origin.
kind: route
---

A headless WordPress site has a Next.js or Astro frontend on `www.example.com`, with WordPress itself on a separate origin like `cms.example.com`. WordPress core already ships a sitemap at `/wp-sitemap.xml`, and Yoast or Rank Math add their own, but all of them build every `<loc>` from the one URL WordPress knows about, its own. Submit that to Search Console and every entry points at the CMS origin, not at the pages visitors actually land on. Core's sitemap has no setting for "list these posts under another domain".

## Why a route, and why a package

Rewriting URLs in the existing sitemap output is a patch on a document that was never built for the domain that needs it. The cleaner fix is to let the frontend's build ask WordPress for the data and write the sitemap itself, at its own domain. The XML format has real structure: a 50,000 URL cap per file, an index file past it, W3C datetime for `lastmod`, escaping of every URL. [`icamys/php-sitemap-generator`](https://packagist.org/packages/icamys/php-sitemap-generator) writes that part. Its last release (5.0.0) is from 2023, it needs PHP 8.0 or later and is small and stable, but check Packagist before you depend on it for a long-lived site. For a plain list of URLs, PHP's own `XMLWriter` would also do, and the route would not need the package.

## The project

```text
headless-sitemap/
├── loopress.json
├── composer.json
└── api/
    └── sitemap-data.php
```

```bash
lps composer push && lps api push
```

## The route

```php title="api/sitemap-data.php"
<?php

declare(strict_types=1);

use Icamys\SitemapGenerator\Config;
use Icamys\SitemapGenerator\SitemapGenerator;

// Builds the sitemap for a headless front end's own domain, from the posts and pages WordPress
// holds, with icamys/php-sitemap-generator (installed via Composer). Mirrors the cookbook recipe at
// https://docs.loopress.dev/cookbook/content-and-data/headless-sitemap-generation-wordpress-rest-api/.
// Set two options first: `headless_frontend_url` (e.g. https://www.example.com, no trailing slash)
// and `sitemap_build_secret`, the value the front end's build sends in `x-build-secret`.
class SitemapData
{
    // The protocol caps one sitemap file at 50,000 URLs: stay under it so one file is enough.
    private const MAX_URLS = 50000;

    public function get(WP_REST_Request $request): array|WP_Error
    {
        $baseUrl = rtrim((string) get_option('headless_frontend_url'), '/');
        // Syntax and scheme only: the route never requests this URL, so no DNS lookup is wanted.
        $parts = wp_parse_url($baseUrl);
        if (!is_array($parts) || !in_array($parts['scheme'] ?? '', ['http', 'https'], true) || empty($parts['host'])) {
            return new WP_Error('no_frontend_url', 'Set the headless_frontend_url option first.', ['status' => 500]);
        }

        $posts = get_posts([
            'post_type'              => ['post', 'page'],
            'post_status'            => 'publish',
            // One more than the cap, to tell a full sitemap from a truncated one.
            'posts_per_page'         => self::MAX_URLS + 1,
            'orderby'                => 'modified',
            'no_found_rows'          => true,
            'update_post_term_cache' => false,
            'update_post_meta_cache' => false,
        ]);

        if (count($posts) > self::MAX_URLS) {
            return new WP_Error('too_many_urls', 'More than 50,000 published posts and pages: paginate on the frontend side.', ['status' => 500]);
        }

        // The library throws on finalize() when no URL was added.
        if ($posts === []) {
            return ['xml' => '', 'urls' => 0];
        }

        // The library only writes to disk: give it a directory of its own, removed afterwards.
        $dir = trailingslashit(sys_get_temp_dir()) . 'sitemap-' . wp_generate_uuid4();
        mkdir($dir, 0700);

        try {
            $config = new Config();
            $config->setBaseURL($baseUrl);
            $config->setSaveDirectory($dir);

            $generator = new SitemapGenerator($config);
            $generator->setSitemapFilename('headless-sitemap.xml');

            // Full post objects: one query, so get_permalink() does not load each post again.
            foreach ($posts as $post) {
                // The path only: the front end serves the same permalinks on its own domain.
                $path     = wp_make_link_relative(get_permalink($post));
                $modified = new DateTime((string) get_post_modified_time('c', true, $post));
                $generator->addURL($path, $modified, 'weekly', $post->post_type === 'page' ? 0.9 : 0.8);
            }

            $generator->flush();
            $generator->finalize();

            return ['xml' => (string) file_get_contents($dir . '/headless-sitemap.xml'), 'urls' => count($posts)];
        } finally {
            array_map('unlink', glob($dir . '/*') ?: []);
            rmdir($dir);
        }
    }

    public function permission(WP_REST_Request $request): bool
    {
        $secret = (string) get_option('sitemap_build_secret');

        // An unset option would otherwise match a missing header: hash_equals('', '') is true.
        return $secret !== '' && hash_equals($secret, (string) $request->get_header('x-build-secret'));
    }
}
```

The library only writes to disk, there is no in-memory output, so the route gives it a temporary directory of its own, reads the file back and removes the directory in a `finally` block, whatever happens. The frontend's build calls this route, takes `xml` from the JSON response and writes it to its own `public/sitemap.xml`.

Two things the route assumes about your frontend:

- **Same permalinks.** It sends `wp_make_link_relative(get_permalink($post))` appended to the frontend URL, so the frontend must serve posts and pages at the paths WordPress gives them (`/first-post/`, with pretty permalinks on). If your routes differ, map the path here.
- **The home page is yours to add.** Only posts and pages are listed. A static front page is a page and appears already, but with the default latest-posts home nothing maps to `/`, so the frontend adds its home URL when it writes the file, once.
- **Posts and pages only.** Add a custom post type to `post_type`, or loop over [custom post types](/custom-post-types/) and [taxonomies](/taxonomies/) archives the same way.

Past 50,000 URLs the library would split the output into several files and an index. The route refuses to answer past 50,000 (an error, never a silently shortened sitemap) so a single file is always enough, which fits most sites. A larger one should paginate and write an index on the frontend side.

## Now call it

Set the two options the route reads, once, on the site (`wp option update headless_frontend_url https://www.example.com`, same for `sitemap_build_secret`), then:

```bash
curl https://your-site.com/wp-json/loopress-api/v1/sitemap-data \
  -H "x-build-secret: <secret>"
```

With a published post, a page and a draft on a test site, the real answer (shortened) lists the two published entries and never the draft. A site with no published post or page gets `"xml": ""` and `"urls": 0`:

```json
{
  "xml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\" ...>\n <url>\n  <loc>https://www.example.com/cafe-menu/</loc>\n  <lastmod>2026-11-13T10:08:47+00:00</lastmod>\n  <changefreq>weekly</changefreq>\n  <priority>0.9</priority>\n </url>\n ...</urlset>\n",
  "urls": 2
}
```

## Permission

Building this list is a query over every published post, expensive enough on a large site that it should not be free to hit, and it is meant for one caller, the frontend's build process, not a browser or a crawler. A request without the header, or with a wrong one, gets a `401`.

The `$secret !== ''` check matters: `hash_equals('', '')` is `true`, so without it a site where the option was never set would accept a request that sends no header at all.

## Why not `/wp-sitemap.xml`

WordPress core's sitemap is a fine default for a site WordPress renders itself. It fails a headless one for three reasons: every URL uses the WordPress origin, the output is an index plus one file per post type and page of 2,000 entries, and the only way to change the domain is to filter every entry (`wp_sitemaps_posts_entry`, `wp_sitemaps_posts_query_args`) and the index, so you keep core's structure and patch its output. This route trades the free, always-on core feature for one file at the right domain. If you can serve the CMS origin and the frontend from the same domain, with WordPress's `home` and `siteurl` set to it, core's sitemap is enough and you need none of this.

## A missing package fails the one request, not the site

Without `icamys/php-sitemap-generator` installed, `SitemapGenerator` is an undefined class, an ordinary PHP error scoped to this request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, so install it through [Composer dependency management](/composer/) before pushing the route. See [Custom API routes](/api/routes/) for how routes and `permission()` work.
