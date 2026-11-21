---
title: Leaving Loopress
description: What keeps working on a site once the Loopress plugin is deactivated or uninstalled, what stops, and how to move each resource out by hand.
---

Your repository already holds everything as plain files: JSON for the configuration, PHP classes for the code, HTML for the pages. Nothing is locked on a Loopress server. The site is a different story: some resources are ordinary WordPress data once pushed and survive without the plugin, others are registered by the plugin on every request and stop the moment it is deactivated.

This page lists both, so you can plan the exit before you need it.

## Deactivating versus uninstalling

- **Deactivating** the plugin stops everything it registers at runtime (the "lost" rows below). Files and database rows stay, so activating it again brings everything back.
- **Uninstalling** it (deleting it from **Plugins**) also removes the whole `wp-content/loopress/` tree: API route and hook files, `lib/`, dynamic blocks, built apps, and the Composer environment (`composer.json`, `composer.lock`, `vendor/`). Copy what you need out of that folder first, or rebuild it from your repository. The options Loopress stored its definitions in (`loopress_post_types`, `loopress_taxonomies`, `loopress_post_meta`, `loopress_roles`, `loopress_patterns`) and the page meta are left in the database.

## What survives

| Resource | Without the plugin | Why |
|---|---|---|
| [Options](/options/), [menus](/menus/), [theme styles](/theme-styles/), content | Survives | Native WordPress data |
| [ACF](/acf/), [forms](/forms/), [snippets](/snippets/) | Survives | Stored by ACF, WPForms, Code Snippets or WPCode, which keep running |
| [Plugins](/plugins/), [themes](/themes/) | Survives, the Composer manifest is lost on uninstall | Files in `wp-content/plugins/` and `wp-content/themes/`. `composer.json` and `composer.lock` live in `wp-content/loopress/` |
| [Templates and parts](/pages/#templates-and-parts) | Survives | Files of the `<parent>-loopress` child theme |
| [Theme CSS](/pages/#theme-css) | **Lost** | Written into the child theme's `style.css` and `blocks/` folder, but enqueued by the plugin |
| [Custom post types](/custom-post-types/), [taxonomies](/taxonomies/) | **Lost**, their posts and terms become unreachable | `register_post_type()` and `register_taxonomy()` run on every request from a stored option |
| [Post meta](/post-meta/) | **Lost** registration, the values stay | `register_post_meta()` runs on every request: type, default and REST exposure are gone |
| [Roles](/roles/) | **Lost**, users keep a role that no longer exists and lose its capabilities | Kept out of the roles option on purpose, added on every request |
| [Hooks](/hooks/) | **Lost** | `#[Action]`, `#[Filter]` and `#[Cron]` are bound by the plugin |
| [API routes](/api/), `lib/` | **Lost** | Dispatched by the plugin under `loopress-api/v1` (or the configured `api.namespace`), `LoopressLib\` autoloaded by it |
| [Composer libraries](/composer/) | **Lost** autoload, deleted on uninstall | `wp-content/loopress/vendor/`, loaded by the plugin |
| [Dynamic blocks](/dynamic-blocks/), [block patterns](/block-patterns/) | **Lost** | Registered by the plugin from `wp-content/loopress/blocks/` and a stored option |
| [Apps](/apps/) | **Lost** | The `[loopress_app]` shortcode and its assets come from the plugin, the files are deleted on uninstall |
| [Static pages](/pages/) | **Empty** between the theme's header and footer | The HTML is in the `_loopress_page_html` post meta, `post_content` is empty, and a `the_content` filter of the plugin inserts it |

ACF, WPForms, Code Snippets and WPCode resources survive only as long as those plugins stay installed: Loopress pushed into them, it does not replace them.

## Moving out by hand

There is no command for this yet. Until there is, write one small plugin of your own (a regular plugin in `wp-content/plugins/`, not a theme's `functions.php`, so a theme switch keeps it). Make it register everything from a `plugins_loaded` callback that returns early while Loopress is active, so nothing (a hook, a cron job, a route) runs twice in between:

```php
add_action('plugins_loaded', function () {
    if (defined('LOOPRESS_VERSION')) {
        return; // Loopress still active, it registers everything itself
    }
    // register_post_type(), add_action(), register_rest_route(), ...
});
```

Install and activate it, deactivate Loopress (your plugin takes over on the next request), create the roles (see below), check the site, and only then uninstall Loopress. If something is missing, activating Loopress again brings it back while you fix your plugin.

What goes into that plugin, resource by resource:

- **Custom post types and taxonomies**: one `register_post_type()` or `register_taxonomy()` call on `init` per file of `post-types/` and `taxonomies/`, with the same slug and arguments. Keep the slugs, or the existing posts and terms are orphaned. Visit **Settings → Permalinks** once afterwards to flush the rewrite rules.
- **Post meta**: one `register_post_meta()` call per key, with the arguments from `post-meta/`.
- **Roles**: one `add_role()` per file of `roles/`, with the same slug and capabilities, or `wp role create` with WP-CLI. Unlike Loopress, this writes the role to the database, which is what you want once it is gone. Do it after deactivating Loopress: while it is active, it strips its own role slugs from every save of the roles option, and `add_role()` does nothing for a slug that already exists.
- **Hooks**: copy the hook classes and replace each `#[Action]` or `#[Filter]` attribute with the matching `add_action()` or `add_filter()` call, with the same hook name, priority and accepted arguments. A `#[Cron]` method needs both: `add_action()` to bind the method to its event hook, and `wp_schedule_event()` to schedule that hook, guarded by `wp_next_scheduled()` so it is scheduled only once. Drop the `use Loopress\...` lines.
- **API routes and `lib/`**: copy the route classes and `lib/`, and register each route with `register_rest_route()` on `rest_api_init`, under the same namespace as before (`loopress-api/v1`, or the one set with [`api.namespace`](/loopress-json/#api)), so client URLs do not change. Give each one a `permission_callback` at least as strict as before (the default is `manage_options`), never `__return_true` for a route that was protected. Replace the `LoopressLib\` autoload with your own `require` lines or a PSR-4 autoloader.
- **Composer libraries**: copy the project's `composer.json` (libraries only, plugins and themes are already installed) into your plugin, run `composer install` there, and `require` its `vendor/autoload.php`. A [snippet using a package](/composer/using-in-snippets/) needs that autoload loaded first.
- **Dynamic blocks**: copy each block folder from `blocks/` and call `register_block_type()` on it.
- **Block patterns**: one `register_block_pattern()` per pattern, with the content of its file.
- **Apps**: copy each app's build output (its `assetsDir`, `dist/` by default) and enqueue its files from your own shortcode or block.
- **Theme CSS**: enqueue the child theme's `style.css` on `wp_enqueue_scripts` with `wp_enqueue_style()`, and each `blocks/<namespace>/<block>.css` with `wp_enqueue_block_style()`.
- **Static pages**: either paste each page's HTML from `pages/` into the page's content in the editor, or ship the `pages/*.html` files in your plugin with a `the_content` filter that returns the file matching the page slug. The first makes the pages editable in wp-admin again, the second keeps them locked to code.

Keep the Loopress files in your repository until the site has run on your plugin for a while: they are the reference for every value above.
