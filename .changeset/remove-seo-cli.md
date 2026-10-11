---
"@loopress/cli": minor
---

Breaking: the `lps seo` command group (`pull`, `push`, `list`, `diff`, `rollback`) is removed, along with its step in `lps pull`, `lps push` and `lps diff` and the `seoDir` key in `loopress.json`. Loopress versions configuration, never content: per-post SEO meta and redirects belong to the content editors manage in wp-admin, and most of that meta is data the SEO plugin generates itself. The site-wide SEO settings are one option row, tracked like any other option. To migrate, run `lps option add rank-math-options-titles` (Rank Math) or `lps option add wpseo_titles` (Yoast SEO), then delete the `seo/` folder and any `seoDir` key. `lps pull` and `lps push` warn while either is still there.
