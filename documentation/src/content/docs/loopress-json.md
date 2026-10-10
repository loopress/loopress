---
title: loopress.json Reference
description: Every field of the project-level loopress.json file, its default, and which commands read it.
---

`loopress.json` sits at the root of your repository and ties it to a Loopress project. It says where each kind of tracked file lives and which WordPress.org plugins and themes the project pins. Commit it to Git.

[`lps init`](/cli/init/) generates it interactively. You can also write it by hand:

```json
{
  "projectId": "my-site",
  "rootDir": ".",
  "snippetsDir": "snippets",
  "apiDir": "api",
  "plugins": {
    "code-snippets": "latest",
    "woocommerce": "9.4.2"
  },
  "themes": {
    "generatepress": "3.4.0"
  }
}
```

Every field is optional. A field left out takes its default.

## Project

| Field | Default | Description |
|-------|---------|-------------|
| `projectId` | none | Name of a project configured with [`lps project config`](/concepts/#projects-and-environments). Takes precedence over the globally active project for every command run in this directory. |
| `rootDir` | `.` | Base directory. Every other path in this file is resolved relative to it. |

## Resource directories

Each directory is relative to `rootDir`. The `path` argument of a command (`lps snippet push ./wp-snippets`) overrides it for one run.

| Field | Default | Holds | Used by |
|-------|---------|-------|---------|
| `snippetsDir` | `snippets` | Code snippets and their `.json` sidecars | [`lps snippet`](/snippets/) |
| `acfDir` | `acf` | ACF field groups, post types, taxonomies and options pages | [`lps acf`](/acf/) |
| `seoDir` | `seo` | SEO settings, post meta and redirects | [`lps seo`](/seo/) |
| `formDir` | `forms` | WPForms forms | [`lps form`](/forms/) |
| `menuDir` | `menus` | Nav menus, one file per menu, plus `menu-locations.json` | [`lps menu`](/menus/) |
| `cptDir` | `cpt` | Custom post types, one `<slug>.json` file of `register_post_type()` arguments each | [`lps cpt`](/custom-post-types/) |
| `taxonomyDir` | `taxonomies` | Taxonomies, one `<slug>.json` file of `register_taxonomy()` arguments plus `object_type` each | [`lps taxonomy`](/taxonomies/) |
| `optionsDir` | `options` | Tracked `wp_options` rows, only the ones added with `lps option add` | [`lps option`](/options/) |
| `themeStylesDir` | `theme` | The active block theme's Global Styles | [`lps theme style`](/theme-styles/) |
| `apiDir` | `api` | Custom API route files | [`lps api`](/api/cli/) |
| `hooksDir` | `hooks` | Hook files (actions, filters, cron) | [`lps hook`](/hooks/) |
| `pageDir` | `pages` | Static HTML pages | [`lps page`](/pages/) |
| `templateDir` | `theme/templates` | Block templates, written to the Loopress child theme | [`lps theme template`](/pages/#templates-and-parts) |
| `partDir` | `theme/parts` | Block template parts, written to the Loopress child theme | [`lps theme template`](/pages/#templates-and-parts) |
| `appsDir` | `apps` | Single-page app bundles, one subdirectory per app | [`lps app`](/apps/cli/) |

## Plugins and themes

| Field | Description |
|-------|-------------|
| `plugins` | WordPress.org plugins the project pins, keyed by slug. A value is an exact version (`"9.4.2"`), `"latest"`, or `{"version": "1.7.2", "active": false}` for a plugin kept installed but inactive. Written by `lps plugin pull`, `lps plugin add`, and the snippet provider prompt of `lps init`. See [Plugins](/plugins/#the-lockfile). |
| `themes` | WordPress.org themes the project pins, keyed by slug, with an exact version or `"latest"`. Written by `lps theme version pull` and `lps theme add`. Never switches the active theme. See [Themes](/themes/). |

When the repository has a `composer.json`, that file is authoritative for plugins and themes instead, see [where the Composer files live](/plugins/#where-the-composer-files-live).

## Editor validation

The JSON Schema for this file ships with the CLI package, as `@loopress/cli/schema/project-config`. Point your editor's JSON schema setting at it to get completion and validation for every field above.

## Not in this file

- **Credentials and environment URLs** live in the global config on your machine (`~/.config/loopress/config.json`), never in the repository. See [Projects and environments](/concepts/#projects-and-environments).
- **App settings** live in each app's own `loopress.app.json`. See [Single-Page Apps](/apps/#loopressappjson).
