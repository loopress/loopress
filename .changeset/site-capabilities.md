---
"@loopress/cli": minor
"@loopress/wordpress-plugin": minor
---

The plugin now exposes `loopress/v1/capabilities` (edition, version, environment type, ACF/form/snippet integrations, active theme and Loopress child theme), and the CLI requires it: an older plugin is asked to update. `lps push` refuses upfront, with the fix, when the project uses snippets, forms or ACF the site can't hold, instead of failing at that step after pushing everything before it. New `lps theme activate` (the Loopress child theme by default, which starts from its parent's theme mods and Global Styles) and `"activateChildTheme": true` in loopress.json to keep the child active on `lps theme template push`. Global Styles keep the parent's file name while the child is active. `lps content copy` activates locally the theme and plugins active on the source. `lps doctor` reports the site's capabilities.
