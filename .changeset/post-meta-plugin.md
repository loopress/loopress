---
"@loopress/wordpress-plugin": minor
---

Post meta keys can now be declared in code too, in both editions: each `meta/<post-type>.json` file maps meta keys to their `register_post_meta()` arguments (type, single, default, REST exposure), `post` and `page` included. Arguments that would run code (`sanitize_callback`, `auth_callback`, `show_in_rest.prepare_callback`) are refused, so are an unknown type, a default of the wrong type, and an array or object exposed in REST without a schema. A key already registered elsewhere is skipped. Only the keys are synced, never their values. The Config tab lists the registered meta keys per post type, and flags a key sharing its name with an ACF field.
