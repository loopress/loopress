---
"@loopress/wordpress-plugin": minor
---

Adds static pages (Loopress Full only): a `loopress/v1/pages` endpoint that creates or updates a WordPress page from hand-written HTML, stored in a hidden post meta and rendered inside the active theme through `the_content` (no `wpautop`). Pages managed this way get a "Managed by Loopress" badge and can no longer be edited in wp-admin; trashing stays possible. A push is refused, with nothing written, on a page Loopress didn't create, a trashed page, a slug WordPress would rename, or HTML over the `loopress_max_file_bytes` / `loopress_max_files_total_bytes` limits.
