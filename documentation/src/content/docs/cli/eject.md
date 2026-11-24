---
title: lps eject
description: Turn a Loopress project into one standard WordPress plugin, so the site keeps working without Loopress.
---

`lps eject` turns the project into one ordinary WordPress plugin. Once it is installed, the site behaves the same with the Loopress plugin deactivated, then uninstalled.

```bash
lps eject             # writes eject/<project-slug>/
lps eject --dry-run   # lists what would be generated, writes nothing
lps eject --out ../site-plugin --force
```

It reads the repository only. It never contacts a site, needs no account, no token and no network, and changes nothing on any site.

## What it generates

A folder `eject/<project-slug>/`, named after the project directory:

| File | Holds |
|------|-------|
| `<project-slug>.php` | The plugin header (GPL-2.0-or-later). Loads `bootstrap.php`, only once Loopress is deactivated |
| `bootstrap.php` | Every registration as the plain WordPress call it stands for |
| `hooks/` | Your hook classes, copied as written, minus the `use Loopress\...` lines and the `#[Action]`, `#[Filter]`, `#[Cron]` attributes |
| `api/` | Your route classes, copied as written (with an `ABSPATH` guard), and `runtime/api-attributes.php`, which declares `#[Permission]` and `#[Hidden]` so the files keep working unchanged |
| `lib/` | Your shared classes, copied as written |
| `composer.json` | The libraries of your `composer.json` (WordPress.org plugins and themes left out). Run `composer install --no-dev --optimize-autoloader` in the plugin folder before zipping it |
| `pages/` | The body of each `pages/<slug>.html`, without its header |

What `bootstrap.php` holds, per resource:

| Resource | Generated code |
|----------|----------------|
| `cpt/`, `taxonomies/` | `register_post_type()` and `register_taxonomy()` on `init`, at the same priorities as Loopress (9 and 8) |
| `meta/` | `register_post_meta()` on `init`, after the post types |
| `patterns/` | `register_block_pattern()`, under the same `loopress/<slug>` names, so existing pattern blocks keep resolving |
| `roles/` | `add_role()`. Unlike Loopress, the role is saved in the database once, like any plugin's role: to change its capabilities later, `remove_role()` it first |
| `hooks/` | One `add_action()`, `add_filter()` or `wp_schedule_event()` line per attribute. A `#[Cron]` keeps its event name, so events already scheduled on the site still run. A callback that throws is logged and skipped, as before |
| `api/` | One `register_rest_route()` per file on `rest_api_init`, under the same namespace (`api.namespace`, `loopress-api/v1` by default) and the same route paths, `[id]` segments included. One endpoint per public `get`, `post`, `put`, `patch`, `delete` method, with the same permission rules (`#[Permission]` on the method or the class, the file's `permission()`, else `manage_options`) and `headers()`. A method that throws answers 500, a permission check that throws denies |
| `lib/` | A PSR-4 autoloader for the `LoopressLib\` namespace, which route and hook files keep using |
| `composer.json` | `require` of `vendor/autoload.php` when it exists |
| `pages/` | The same `the_content` filter, by page slug: each page still renders its file, `post_content` is never written, and the pages stay closed to the editor. `full-width` and `hide-title` keep working |
| `theme/css/`, `theme/blocks/` | The enqueue of the `<parent>-loopress` child theme stylesheet, same handle. The child theme itself is already a native child theme and stays as it is |

Options, menus, theme styles, ACF field groups, forms, snippets, plugins, themes, templates and parts need nothing: they are already plain WordPress data or files on the site.

## Not ejectable yet

The command refuses, with the full list, when the project uses a resource it cannot turn into plain WordPress code yet. It never writes a partial plugin:

- Apps (`apps/`)
- Dynamic blocks (`blocks/`)
- A route file declaring several classes, or two files for the same route
- A hook file using a Loopress class other than the hook attributes, or an attribute argument that is not a plain string or integer

## Switching over

1. Install `eject/<project-slug>/` on the site like any plugin, and activate it. While Loopress is active, it stays idle, so nothing is registered twice.
2. Deactivate Loopress, then check the site: the plugin takes over on the next request.
3. Uninstall Loopress. Uninstalling deletes `wp-content/loopress/`, which the ejected plugin does not use.

The output folder is refused when it already exists: pass `--force` to replace it. `lps eject` is free and works with both editions of the plugin.
