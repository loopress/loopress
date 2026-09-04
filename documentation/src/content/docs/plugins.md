---
title: Plugins
description: Pin WordPress.org plugin versions in a lockfile and install the identical set on any environment, via Composer and WPackagist.
---

The `plugin` command group tracks WordPress.org plugins as a lockfile in `loopress.json`. Loopress installs them on the site by running **Composer with the [WPackagist](https://wpackagist.org/) repository** inside WordPress, so every environment ends up with the same plugins at the same versions, with no SSH and no need for a `composer.json` in your repo.

This is a [Loopress Full](/wordpress-plugin/) feature.

## The lockfile

```json
{
  "plugins": {
    "woocommerce": "9.4.2",
    "wordpress-seo": "latest"
  }
}
```

Keys are [WordPress.org](https://wordpress.org/plugins/) plugin slugs. Each value is either:

- an **exact version** to pin (`"9.4.2"`), installed on every push and reported as drift if the site diverges, or
- `"latest"`, which updates that plugin to the newest release on every push.

**Removing an entry uninstalls the plugin** on the next push (shown in the plan, with a confirmation prompt).

### Where the Composer files live

For a `loopress.json`-only project, the generated `composer.json` / `composer.lock` stay **on the site** (`wp-content/loopress/`), not in your repo. Reproducibility comes from `loopress.json` alone.

If your repo has a `composer.json` (from `lps composer init`), that file is authoritative for plugins and themes instead, and the `plugin` / `theme` commands defer to `lps composer`. See the [`composer` command group](/composer/cli/).

## Commands

### `lps plugin add`

```bash
lps plugin add woocommerce                 # pins "latest"
lps plugin add woocommerce --version 9.4.2 # pins an exact version
```

| Flag | Description |
|------|-------------|
| `--version` | Exact version to pin (default `"latest"`) |
| `--dry-run` / `-d` | Show what would be written without touching `loopress.json` |

### `lps plugin pull`

Snapshot the installed plugins into `loopress.json`, each **pinned to the version running on the site**.

```console
Pulling plugins from https://example.com
Wrote 4 plugins to loopress.json
  + Added: contact-form-7
  ~ Updated: woocommerce 9.4.2 → 9.5.0
```

### `lps plugin push`

Install the manifest on the site via Composer + WPackagist.

| Flag | Description |
|------|-------------|
| `--force` | Allow downgrades, and let Loopress take over a plugin installed by hand (replaces its files) |
| `--prune` | Deactivate plugins that are active on the site but absent from `loopress.json` |
| `--dry-run` / `-d` | Show the plan without making changes |

The plan lists what will be installed, re-pinned, activated, taken over, or uninstalled:

```console
Pushing plugins to https://example.com

To install (1):
  + contact-form-7 6.0.5
To re-pin (1):
  ~ woocommerce 9.5.0 to 9.4.2
```

**Downgrades** are refused without `--force`: reinstalling older plugin files does not undo database migrations the newer version ran. **Plugins installed outside Loopress** are refused without `--force`, because Composer can't cleanly install over an unmanaged folder.

### `lps plugin status`

Compare the site against `loopress.json` and exit non-zero on drift (usable in CI):

```console
Not installed: contact-form-7
Version drift: woocommerce is 9.5.0, loopress.json pins 9.4.2
Active but untracked: hello-dolly
```

### `lps plugin audit`

Check every pinned plugin against a WordPress vulnerability database ([wpvulnerability.net](https://www.wpvulnerability.net/)) and the WordPress.org plugin API for health signals (removed from the directory, PHP requirement, abandonment). Exits non-zero when a known vulnerability affects a pinned version.

## Limits

- **WordPress.org plugins only.** Premium plugins (ACF Pro, Gravity Forms, …) aren't on WPackagist: `plugin pull` sees them in the live list, `plugin status` marks them untracked, and Loopress never touches them.
- **No rollback of database migrations.** A downgrade replaces files only.
- **Multisite** plugin pinning is not supported yet.
