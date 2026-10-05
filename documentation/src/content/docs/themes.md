---
title: Themes
description: Pin WordPress.org theme versions in a lockfile and install the identical set on any environment, via Composer and WPackagist.
edition: full
---

The `theme` command group works exactly like [`plugin`](/plugins/): it tracks WordPress.org themes as a lockfile in `loopress.json` and installs them on the site through Composer + [WPackagist](https://wpackagist.org/). As with plugins, only exact-version pins reproduce identically across environments; a `"latest"` entry is re-resolved on each push.

```json
{
  "themes": {
    "generatepress": "3.4.0"
  }
}
```

**Loopress manages installed theme versions only. It never switches the active theme** (that can break a live site hard).

## Commands

Every command below also accepts the [common flags](/concepts/#common-flags): `--env`, `--yes`, and `--json` where it applies.

### `lps theme add`

Add a theme to `loopress.json`, pinned to `"latest"` unless you pass `--version`. Local file only.

```bash
lps theme add generatepress
lps theme add generatepress --version 3.4.0
```

---

### `lps theme pull`

Pull everything theme related that can be pulled: versions, then [Global Styles](/theme-styles/). Templates and parts have no pull.

---

### `lps theme push`

Push everything theme related, in order: versions, then [templates and parts](/pages/#templates-and-parts), then [Global Styles](/theme-styles/). Accepts `--force`.

---

### `lps theme status`

Report version drift between the themes on WordPress and `loopress.json`. Exits non-zero on drift, so it can gate a CI job.

---

### `lps theme version pull` / `push`

The versions-only half of `pull` and `push`: `version pull` snapshots the installed themes into `loopress.json`, pinned to their live versions, and `version push` installs the manifest via Composer + WPackagist. `version push` accepts `--force` and `--dry-run`.

`--force` allows downgrades and lets Loopress take over a theme installed by hand. The same limits as [plugins](/plugins/#limits) apply: WordPress.org themes only, no rollback of database migrations, no multisite.

If your repo has a `composer.json`, it is authoritative: `lps theme version pull` pins live versions into it as `wpackagist-theme/<slug>` entries (same rules as [plugins](/plugins/#lps-plugin-pull): constraints kept, themes not on WordPress.org skipped), and `lps theme version push` defers to [`lps composer push`](/composer/cli/).

:::note
The aggregate [`lps push`](/workflow/#what-each-command-covers) only includes templates and parts (`lps theme template push`). It skips theme versions and Global Styles, and `lps pull` and `lps promote` skip themes entirely. Run `lps theme push` / `lps theme pull` explicitly.
:::
