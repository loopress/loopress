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

**The lockfile manages installed theme versions only. It never switches the active theme** (that can break a live site hard). Switching is an explicit [`lps theme activate`](#lps-theme-activate).

## Commands

Every command below also accepts the [common flags](/concepts/#common-flags): `--env`, `--json`, and `--yes` where it applies.

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

### `lps theme activate`

Activate a theme, the Loopress child theme (`<parent>-loopress`, see [templates and parts](/pages/#templates-and-parts)) when you name none. Supports `--dry-run`, and asks for confirmation when the target is named `production`. Works on Loopress Light too, for a theme you name.

```bash
lps theme activate
lps theme activate twentytwentyfive --env staging
```

WordPress stores theme mods and Global Styles per theme, so a child that has none of its own yet starts from a copy of its parent's: the site looks the same after the switch. The child must exist first (`lps theme template push`), and the parent must be a block theme that isn't itself a child theme. Set `"activateChildTheme": true` in [`loopress.json`](/loopress-json/#plugins-and-themes) to have every template push keep the child active.

---

### `lps theme version pull` / `push`

The versions-only half of `pull` and `push`: `version pull` snapshots the installed themes into `loopress.json`, pinned to their live versions, and `version push` installs the manifest via Composer + WPackagist. `version push` accepts `--force` and `--dry-run`.

`--force` allows downgrades and lets Loopress take over a theme installed by hand. The same limits as [plugins](/plugins/#limits) apply: WordPress.org themes only, no rollback of database migrations, no multisite.

If your repo has a `composer.json`, it is authoritative: `lps theme version pull` pins live versions into it as `wpackagist-theme/<slug>` entries (same rules as [plugins](/plugins/#lps-plugin-pull): constraints kept, themes not on WordPress.org skipped), and `lps theme version push` defers to [`lps composer push`](/composer/cli/).

:::note
The aggregate [`lps push`](/workflow/#what-each-command-covers) includes templates and parts and, once the project tracks them, [Global Styles](/theme-styles/). `lps pull` includes Global Styles too. Theme versions stay out of both, and so of `lps promote`: run `lps theme push` / `lps theme pull` explicitly.
:::
