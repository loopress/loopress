---
"@loopress/wordpress-plugin": patch
---

Adds `#[Hidden]`, a class-level attribute for route files: every verb in the file is excluded from the `/wp-json/{namespace}` discovery index (`show_in_index => false`, WP core's own flag) while the route keeps dispatching normally. Useful for a route whose response shape isn't a fixed REST resource, a GraphQL endpoint or an HTML-serving page.
