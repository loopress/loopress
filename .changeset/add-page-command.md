---
"@loopress/cli": minor
---

Add `lps page pull`, `lps page push`, and `lps page list` to sync WordPress pages as files in Git. Talks directly to WordPress core's own REST API (`wp/v2/pages`), no Loopress plugin required. Each page is a pair of files: `<id>-<slug>.html` for the raw Gutenberg block content, a real file you can open and edit directly, and `<id>-<slug>.json` for everything else (title, slug, status, parent, menu_order, template, meta, excerpt...), filtered down to only the fields WordPress actually accepts back on write so readonly/computed noise that changes on every edit regardless of actual content (`_links`, `guid`, `modified`) doesn't produce a diff on every pull. `parent` round-trips as the source site's raw page id and isn't remapped across environments.
