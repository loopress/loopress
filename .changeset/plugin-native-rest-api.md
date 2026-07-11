---
"@loopress/cli": minor
---

`lps plugin` commands now use WordPress core's native `wp/v2/plugins` REST API instead of a custom Loopress endpoint. As a result, plugin version pinning is no longer supported: `lps plugin add` no longer accepts a `[version]` argument, and `loopress.json` always stores `"latest"` for managed plugins. Pin an exact version through the `composer` command group and wpackagist instead.
