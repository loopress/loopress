---
"@loopress/wordpress-plugin": patch
---

Admin page styles are now enqueued (`wp_add_inline_style`) instead of echoed as raw `<style>` tags, and the Loopress top-level menu item moved from position 6 to 100 so it stops competing with WordPress core's own menu hierarchy. Both were flagged by the wordpress.org plugin review.
