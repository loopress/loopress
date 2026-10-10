---
"@loopress/wordpress-plugin": minor
---

Taxonomies can now be declared in code too, in both editions: each `taxonomies/<slug>.json` file holds the `register_taxonomy()` arguments plus `object_type`, the post types it attaches to. Same rules as custom post types: arguments that would run code are refused, so are values of the wrong type, a slug already registered elsewhere is skipped, and permalinks are refreshed once after a change. Only the taxonomy is synced, never its terms. The Config tab lists every taxonomy on the site with its source, the post types it's attached to and its number of terms.
