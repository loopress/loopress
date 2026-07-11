# @loopress/wordpress-plugin

## 2026.8.0

### Minor Changes

- 9a8f6b5: Removed `PluginService`, `PluginController`, and the `loopress/v1/plugins*` REST routes. Plugin management now relies entirely on WordPress core's native `wp/v2/plugins` REST API, which the Loopress CLI calls directly.

## 2026.7.2

### Patch Changes

- 3f04ab4: Replace md5 hash function by native hash function with sha256
- 13c5fb9: Add tab on the UI and diagnostics panel
- 1dc1228: Unify snippet route

## 2026.7.1

### Patch Changes

- 6122ddc: Align better sidecar file with WPCode api

## 2026.7.0

### Minor Changes

- 25ece79: 1st release of the plugin containing basic UI fordependencies installation. It also contains endpoints to let the CLI interact with Wordpress
