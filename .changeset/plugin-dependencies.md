---
"@loopress/cli": patch
---

Handle plugin dependencies (`Requires Plugins`): `lps plugin add` also adds the plugins a plugin requires (e.g. `woocommerce` for `dokan-lite`), and `lps plugin push` activates dependencies before the plugins that need them instead of failing on WordPress's `plugin_missing_dependencies` refusal.
