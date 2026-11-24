---
"@loopress/cli": patch
---

A page or block pattern that starts with block markup (`<!-- wp:paragraph -->`, as exported by the block editor) is no longer refused as an unknown header key: a leading comment starting with `wp:` is kept as content.
