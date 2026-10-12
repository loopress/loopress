---
"@loopress/cli": minor
---

`lps theme template push` now also pushes the theme CSS, bundled with esbuild: `theme/css/style.css` (the entry, it `@import`s the rest of `theme/css/` in cascade order) becomes the Loopress child theme's `style.css`, loaded on every page, and each `theme/blocks/<namespace>/<block>.css` is loaded only on pages that render that block. Relative `url()` fonts and images are copied next to the CSS. The push warns about a block file named after no block registered on the site. New `cssDir` and `blockCssDir` keys in `loopress.json`, and `lps dev` watches both folders (`css`, `blocks`). Needs the matching plugin release.
