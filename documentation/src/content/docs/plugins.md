---
title: Plugins
description: Pin WordPress.org plugin versions in a lockfile and install the identical set on any environment, via Composer and WPackagist.
edition: full
---

The `plugin` command group tracks WordPress.org plugins as a lockfile in `loopress.json`. Loopress installs them on the site by running **Composer with the [WPackagist](https://wpackagist.org/) repository** inside WordPress, with no SSH and no need for a `composer.json` in your repo. Entries pinned to an exact version install identically on every environment. `latest` entries are re-resolved by Composer on each push, so environments pushed at different times can land on different versions.

## The lockfile

```json
{
  "plugins": {
    "woocommerce": "9.4.2",
    "wordpress-seo": "latest",
    "hello-dolly": {"version": "1.7.2", "active": false}
  }
}
```

Keys are [WordPress.org](https://wordpress.org/plugins/) plugin slugs. Each value is either:

- an **exact version** to pin (`"9.4.2"`), installed on every push and reported as drift if the site diverges, or
- `"latest"`, which updates that plugin to the newest release on every push. Because it re-resolves each time, it is not reproducible across environments.

Either form keeps the plugin **active**. To keep a plugin installed but inactive, use the object form `{"version": "1.7.2", "active": false}`: `lps plugin pull` writes it for every plugin that is inactive on the site, and `lps plugin push` deactivates the plugin if it is active.

**Removing an entry uninstalls the plugin** on the next push (shown in the plan, with a confirmation prompt).

### Where the Composer files live

For a `loopress.json`-only project, the generated `composer.json` / `composer.lock` stay **on the site** (`wp-content/loopress/`), not in your repo. Exact-version pins in `loopress.json` reproduce identically on every environment; `latest` pins are resolved per push and do not.

If your repo has a `composer.json` (from `lps composer init`), that file is authoritative for plugins and themes instead, `lps plugin pull` / `lps theme version pull` write into it, and `lps plugin push` pushes it whole (see [below](#with-a-composerjson)). See the [`composer` command group](/composer/cli/).

## Commands

Every command below also accepts the [common flags](/concepts/#common-flags): `--env`, `--json`, and `--yes` where it applies.

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

Snapshot the project's plugins into `loopress.json`, each **pinned to the version running on the site**, with its active state: an inactive plugin is written as `{"version": "…", "active": false}` so the next push leaves it inactive.

Plugins the project already tracks are always refreshed. Every other plugin installed on the site is offered as a list to tick, **unticked by default**: a pull from production should not bring its cache, security or backup plugins (LiteSpeed Cache, Wordfence, UpdraftPlus) into the project. Leave them unticked: `lps plugin push` leaves a plugin the project doesn't track installed and active (only `--prune` deactivates it), so production keeps them and other environments never get them.

| Flag | Description |
|------|-------------|
| `--plugin <slug>` | Start tracking this installed plugin too, without asking. Repeatable |
| `--yes` / `-y` | Don't ask: refresh the tracked plugins and those named with `--plugin` only |

Without a terminal (CI, `--json`, the MCP server) nothing is asked either: only the tracked plugins and the ones named with `--plugin` are written. The others are listed as not tracked.

```console
Pulling plugins from https://example.com
  - Not tracked: wordfence, litespeed-cache (add one with `lps plugin pull --plugin <slug>`)
Wrote 4 plugins to loopress.json
  + Added: contact-form-7
  ~ Updated: woocommerce 9.4.2 → 9.5.0
```

If the repo has a `composer.json`, the live versions are pinned there instead, as `wpackagist-plugin/<slug>` entries under `require`. Every other key is left as is. Some plugins are listed as skipped instead of pinned:

- a version constraint you wrote (`^9.4`, `*`) is kept, only an exact pin moves to the live version;
- a plugin declared in `require-dev` stays there (see [local-only plugins](#local-only-plugins));
- a plugin provided by another package (`acme/<slug>`) is not duplicated;
- a plugin that isn't on WordPress.org (premium or custom, so not on WPackagist) is not added, since it would make the whole `composer update` fail.

```console
Pulling plugins from https://example.com
Pinned 2 plugins in composer.json
  + Added: akismet
  ~ Updated: redirection 5.4.0 → 5.5.0
  - Skipped: woocommerce (keeps constraint ^9.4, live 9.5.0)
  - Skipped: advanced-custom-fields-pro (not on WordPress.org)
Run `lps composer push` to apply.
```

Checking WordPress.org needs network access to `api.wordpress.org`. If that check fails (network error, WordPress.org down), the pull stops with the reason and leaves `composer.json` untouched: retry later. The file keeps its original indentation, so the git diff only shows the entries that changed.

This is not the same as `lps composer pull`, which overwrites `composer.json` with the server's copy: see [which pull to use](/composer/cli/#lps-composer-pull).

### `lps plugin push`

Install the manifest on the site via Composer + WPackagist, and apply each plugin's active state.

| Flag | Description |
|------|-------------|
| `--activate` | `composer.json` projects only: activate every plugin it declares |
| `--force` | Allow downgrades, and let Loopress take over a plugin installed by hand (replaces its files) |
| `--prune` | Deactivate plugins that are active on the site but absent from `loopress.json` (or `composer.json`) |
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

#### With a composer.json

When the repo has a `composer.json`, `lps plugin push` reads its `wpackagist-plugin/*` entries instead of `loopress.json`. The server always resolves that file whole, so **the push also syncs the themes and libraries it declares**, exactly like `lps composer push`. What `plugin push` adds on top is the plugin plan and its safety: a plugin whose files are replaced is deactivated during the swap and switched back on afterwards.

A `composer.json` has no notion of active or inactive, so the push **activates nothing** by default: plugins keep their current state, and newly installed ones stay inactive. The output lists them. Pass `--activate` to activate every plugin the file declares. A version constraint such as `^9.4` is never reported as drift.

`lps push` runs `plugin push` and skips `composer push` in that case, so Composer only runs once on the server.

#### Local-only plugins

Plugins under `require-dev` are installed on the `local` environment only, never on a remote site, like `composer install --no-dev` on a production server. Use it for development tools such as Query Monitor:

```json
"require-dev": {
  "wpackagist-plugin/query-monitor": "^3.16"
}
```

It also helps with a premium plugin you can't install from WordPress.org: put its free edition in `require-dev` (for example `wpackagist-plugin/easy-digital-downloads` while production runs EDD Pro). Not every premium feature can be tested that way, but the local site gets the plugin's core.

### `lps plugin status`

Compare the site against `loopress.json` and exit non-zero on drift (usable in CI):

```console
Not installed: contact-form-7
Version drift: woocommerce is 9.5.0, loopress.json pins 9.4.2
Pinned inactive but active: akismet
Active but untracked: hello-dolly
```

### `lps plugin audit`

Check every pinned plugin against a WordPress vulnerability database ([wpvulnerability.net](https://www.wpvulnerability.net/)) and the WordPress.org plugin API for health signals (removed from the directory, PHP requirement, abandonment). Exits non-zero when a known vulnerability affects a pinned version.

## Limits

- **WordPress.org plugins only.** Premium plugins (ACF Pro, Gravity Forms, …) aren't on WPackagist, so Loopress can't install or version them. It does still see them on the site: `plugin pull` offers them like any other plugin (leave them unticked), `plugin status` marks them untracked, `--prune` deactivates any active plugin missing from `loopress.json` including premium ones, and `--force` replaces the files of a colliding folder. Keep premium plugins out of `loopress.json`.
- **No rollback of database migrations.** A downgrade replaces files only.
- **Multisite** plugin pinning is not supported yet.
