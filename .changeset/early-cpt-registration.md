---
"@loopress/wordpress-plugin": patch
---

Post types from `cpt/` and taxonomies from `taxonomies/` are now registered on `init` priority 9 and 8 (was 20 and 19), before the default 10. Plugins that read post types during `init` and cache them, like Rank Math for its sitemap settings, now see them. A slug another plugin registers again later is still reported as a conflict.
