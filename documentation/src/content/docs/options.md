---
title: Options
description: Track individual WordPress options (wp_options rows) as JSON files in Git and push them to other environments.
edition: light
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

Every command below also accepts the [common flags](/concepts/#common-flags): `--env`, `--json`, and `--yes` where it applies. Options are also part of the aggregate [`lps push`, `lps pull` and `lps diff`](/workflow/).

### `lps option add`

Read an option from WordPress and write its file, which starts tracking it.

```bash
lps option add <name>
```

---

### `lps option pull`

Refresh every tracked option from WordPress. Options you haven't added are never pulled. A tracked option that no longer exists on WordPress has its local file removed, see [pull mirrors the site](/concepts/#pull-mirrors-the-site).

```bash
lps option pull
```

---

### `lps option push`

Write every tracked, non-readonly option to WordPress. Create or update only, it never deletes an option you don't track. Supports `--dry-run`.

```bash
lps option push --env staging
```

`option push` reads each option's current value right before writing it, and WordPress refuses the write if the option changed in between (someone saved the plugin's settings page meanwhile). Nothing is overwritten silently: pull, check, and push again.

---

### `lps option list`

List option names and their autoload flag, never their values. `CORE` marks a WordPress default option (certain), `SOURCE?` is a best-effort guess of the plugin that owns it.

```bash
lps option list
lps option list --no-core   # hide WordPress's own options
```

---

### `lps option diff`

Show what differs for tracked options between your files and an environment, or between two environments with `--against`. Also part of the aggregate [`lps diff`](/workflow/#lps-diff) (`--only option`).

```bash
lps option diff
lps option diff --env staging --against production
```

Exits `0` in sync, `1` on drift, `2` when the comparison failed.

---

### `lps option rollback`

Restore tracked options on WordPress to the snapshot saved automatically before an earlier `lps option push`. See [Rollback and Snapshots](/rollback/).

```bash
lps option rollback            # the most recent snapshot
lps option rollback --list     # available snapshots
lps option rollback --to <id>  # an older one
```

---

### `lps option remove`

Stop tracking an option and delete it from WordPress. Supports `--dry-run`.

```bash
lps option remove <name>
lps option remove <name> --local-only   # only stop tracking it, keep it on WordPress
```

## Readonly options

Some options must not be copied from one environment to another, even when you want to watch them for drift: `siteurl` and `home` would repoint the target site to the source site's URLs. These are tracked with `"readonly": true` by default, and `option push` skips them:

`siteurl`, `home`, `db_version`, `initial_db_version`, `cron`, `rewrite_rules`, `WPLANG`, `default_role`, `users_can_register`, `uninstall_plugins`, `mailserver_url`, `mailserver_login`, `mailserver_pass`, `mailserver_port`

`readonly` is a local flag only. Set it to `false` in the file to push such an option anyway, or to `true` on any option you want to track without ever pushing it.

## Options that point to a page

Some plugins store a page's ID in their settings: Easy Digital Downloads keeps its checkout and confirmation pages in `edd_settings`, WooCommerce its shop page in `woocommerce_shop_page_id`. IDs differ between environments, so copying them would point at the wrong page, or at nothing.

Declare those values in the file with `refs`, mapping where the ID sits in the value to its post type:

```json
{
  "name": "edd_settings",
  "autoload": "yes",
  "refs": {
    "purchase_page": "page",
    "success_page": "page"
  },
  "value": {
    "purchase_page": "checkout",
    "success_page": "checkout/purchase-confirmation"
  }
}
```

Then run `lps option pull`: the IDs in `value` are rewritten as page paths. From then on, `option push` turns each path back into the ID of that page on the target environment, and `lps diff` compares paths on both sides.

- A key is a dot path into the value (`checkout.success_page` for a nested setting), or `.` when the whole value is the ID (`woocommerce_shop_page_id`).
- An unset setting (`0`, an empty string, or a missing key) is left as is.
- The push fails for that option, with a message naming the setting, when the page doesn't exist on the target, or when the file still holds an ID instead of a path.
- Like `readonly`, `refs` is a local declaration: `option pull` keeps it.

Images are not covered: a reference to an image (a logo set as `site_logo`, for instance) only resolves if that image already exists on the target environment, and Loopress doesn't sync content.

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
