---
title: Options
description: Track individual WordPress options (wp_options rows) as JSON files in Git and push them to other environments.
---

The `option` command group version-controls individual rows of the WordPress `wp_options` table: a plugin's settings array, the site's date format, the front page setting. Unlike the other resources, nothing is tracked by default. You pick the options you care about one by one with `lps option add`, and only those are ever pulled, pushed or compared.

Each tracked option is one JSON file in `options/` (or `loopress.json`'s `optionsDir`), named after the option:

```json
{
  "autoload": "on",
  "name": "wpseo_titles",
  "readonly": false,
  "value": {"separator": "sc-dash", "title-home-wpseo": "%%sitename%%"}
}
```

An option value is copied as is between environments. Before pushing one to another site, check it doesn't embed post, page, term or user ids: those differ from one environment to the next.

## Typical workflow

```bash
# 1. Find the option you want (names only, never values)
lps option list --no-core

# 2. Start tracking it
lps option add wpseo_titles

# 3. Edit options/wpseo_titles.json, commit it, push it to another environment
lps option push --env staging
```

## Commands

| Command | Description |
|---------|-------------|
| `lps option list` | List option names and their autoload flag. `CORE` marks a WordPress default option (certain), `SOURCE?` is a best-effort guess of the plugin that owns it, `--no-core` hides WordPress's own options. |
| `lps option add <name>` | Read an option from WordPress and write its file, which starts tracking it. |
| `lps option pull` | Refresh every tracked option from WordPress. Options you haven't added are never pulled. |
| `lps option push` | Write every tracked, non-readonly option to WordPress. Create or update only, it never deletes an option you don't track. |
| `lps option remove <name>` | Stop tracking an option and delete it from WordPress. `--local-only` only stops tracking it. |
| `lps option diff` | Show what differs for tracked options between your files and an environment, or two environments (`--against`). |
| `lps option rollback` | Restore tracked options to the snapshot saved automatically before an earlier push (`--list` to see them). |

`push`, `remove` and `rollback` accept `--dry-run` and `--yes`. Options are also part of `lps push`, `lps pull` and `lps diff`.

`option push` reads each option's current value right before writing it, and WordPress refuses the write if the option changed in between (someone saved the plugin's settings page meanwhile). Nothing is overwritten silently: pull, check, and push again.

## Readonly options

Some options must not be copied from one environment to another, even when you want to watch them for drift: `siteurl` and `home` would repoint the target site to the source site's URLs. These are tracked with `"readonly": true` by default, and `option push` skips them:

`siteurl`, `home`, `db_version`, `initial_db_version`, `cron`, `rewrite_rules`, `WPLANG`, `default_role`, `users_can_register`, `uninstall_plugins`, `mailserver_url`, `mailserver_login`, `mailserver_pass`, `mailserver_port`

`readonly` is a local flag only. Set it to `false` in the file to push such an option anyway, or to `true` on any option you want to track without ever pushing it.

## What the plugin refuses

The Loopress plugin enforces its own limits, whatever the local files say:

- **Options managed by another command**: `active_plugins`, `stylesheet` and `template` belong to [`lps plugin`](/plugins/) and [`lps theme`](/themes/).
- **Secret-looking names are not readable**: a name containing `secret`, `password`, `token`, `nonce`, `salt`, `credential`, or ending in `_key`/`_pass`, among others. This is a best-effort safeguard, not a guarantee: track only the options you need. To allow one specific name, add a filter on the site:

  ```php
  add_filter('loopress_option_readable', fn ($allowed, $name) => $name === 'my_plugin_public_key' ? true : $allowed, 10, 2);
  ```

- **Options that change who can do what are not writable**: `default_role`, `users_can_register`, `siteurl`, `home`, `cron`, `uninstall_plugins`, `db_version`, `initial_db_version`, the `mailserver_*` options, and every `loopress_*` option. The `loopress_option_writable` filter re-allows a name the same way.
- **Values that aren't plain data**: an option holding a serialized PHP object can't be represented as JSON without losing information, so it's refused rather than corrupted.

Each refusal comes back with the plugin's own explanation.
