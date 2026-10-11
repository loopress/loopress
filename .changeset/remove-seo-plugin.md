---
"@loopress/wordpress-plugin": minor
---

Breaking: the SEO module is removed from both editions, with its `loopress/v1/seo/*` REST routes and the redirects list in the Config tab. The plugin no longer reads or writes Rank Math or Yoast SEO data directly. Their site-wide settings stay syncable as a regular tracked option (`rank-math-options-titles` or `wpseo_titles`) through the options endpoints.
