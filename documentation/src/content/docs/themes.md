---
title: Themes
description: Pin WordPress.org theme versions in a lockfile and install the identical set on any environment, via Composer and WPackagist.
---

The `theme` command group works exactly like [`plugin`](/plugins/): it tracks WordPress.org themes as a lockfile in `loopress.json` and installs them on the site through Composer + [WPackagist](https://wpackagist.org/). As with plugins, only exact-version pins reproduce identically across environments; a `"latest"` entry is re-resolved on each push.

This is a [Loopress Full](/wordpress-plugin/) feature.

```json
{
  "themes": {
    "generatepress": "3.4.0"
  }
}
```

**Loopress manages installed theme versions only. It never switches the active theme** (that can break a live site hard).

## Commands

| Command | Description |
|---------|-------------|
| `lps theme add <slug> [--version <v>]` | Add a theme to `loopress.json` (`"latest"` by default) |
| `lps theme pull` | Snapshot installed themes, pinned to their live versions |
| `lps theme push [--force]` | Install the manifest via Composer + WPackagist |
| `lps theme status` | Report version drift, exit non-zero in CI |

`--force` allows downgrades and lets Loopress take over a theme installed by hand. The same limits as [plugins](/plugins/#limits) apply: WordPress.org themes only, no rollback of database migrations, no multisite.

If your repo has a `composer.json`, it is authoritative and these commands defer to [`lps composer`](/composer/cli/).

:::note
The aggregate `lps push`, `lps pull` and `lps promote` commands do not include themes. Run `lps theme push` / `lps theme pull` explicitly.
:::
