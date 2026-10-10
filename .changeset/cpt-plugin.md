---
"@loopress/wordpress-plugin": minor
---

Custom post types can now be declared in code: each `cpt/<slug>.json` file in your repository holds the `register_post_type()` arguments, and the plugin registers it on every request, in both editions. Arguments WordPress would run as code (`register_meta_box_cb`, the REST controller classes) are refused, and a slug already registered by a theme or another plugin is skipped, never overwritten. Permalinks are refreshed once after a change. The Config tab lists every post type on the site with where it comes from (Loopress, WordPress, ACF, CPT UI, a theme or plugin), its published count, and a Conflict badge for a skipped Loopress one.
