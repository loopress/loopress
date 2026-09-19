---
"@loopress/wordpress-plugin": patch
"@loopress/cli": patch
---

Closes the same race for `seo` that PR #235 closed for `option` (#234): `lps seo push` now conditions its writes on the active SEO plugin's (RankMath or Yoast) state at read time, instead of silently overwriting a change a different actor made on WordPress in between.

`GET /seo/settings` now returns `{revision, settings}` (a content hash of the settings, wrapped so the hash never gets written back into wp_options as if it were a real Titles & Meta field), and `GET /seo/post-meta/{type}/{slug}` now includes a `revision` alongside `meta`, `slug`, and `title` (a content hash of that post's provider-prefixed SEO meta as a whole, since a write replaces the whole set, not just the keys a particular push happens to mention). `seo push` reads the relevant revision right before writing each settings file or post-meta file, and sends it back as `expectedRevision`; `PUT /seo/settings` and `POST /seo/post-meta/{type}` refuse the write (412) if the revision no longer matches, the same optimistic-concurrency check `option` uses. The revision is bookkeeping, never persisted to local files: `settings.json` and post-meta files on disk are unchanged in shape.

The remaining resources tracked in #234 (snippet, form, acf, api, hook, menu, theme-styles) aren't covered yet.
