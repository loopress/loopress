---
"@loopress/wordpress-plugin": minor
---

The Loopress child theme now carries the project's theme CSS. Its `style.css` is loaded on the site and in the editor, inlined when small, and each `blocks/<namespace>/<block>.css` is loaded with `wp_enqueue_block_style()`, only on pages that render that block. Only while the child is the active theme. Fonts and images go to the child's `assets/`, nothing else can be written there.
