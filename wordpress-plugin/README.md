# Loopress

WordPress plugin syncing code snippets (Code Snippets / WPCode) with the Loopress CLI. One codebase, two build editions (`scripts/build-flavor.cjs`, internal flavor arguments `light`/`full`):

- **Loopress Light** (`loopress-light.zip`): snippet sync only, distributed on wordpress.org. Contains no Composer code at all, not even inactive: `src/Dependencies/` and `uninstall.php` are stripped at build time, and `composer.json` ships with an empty `require`.
- **Loopress Full** (`loopress-full.zip`): everything in Loopress Light, plus Composer dependency management (`src/Dependencies/`). Distributed only from loopress.dev, never wordpress.org: a plugin offering a UI to install packages from Packagist is not acceptable in the official directory (guidelines Rule 8), see `obsidian/Product/WordPress.org Plugin Distribution.md` in the monorepo. Ships with `Update URI: https://loopress.dev` so wordpress.org can never push an update over it, and deactivates Loopress Light on activation (the two editions never run side by side; both define `LOOPRESS_VERSION` and refuse to boot if it is already defined).

Development always targets the full (Loopress Full) feature set: `composer.json` at the repo root requires `composer/composer`, and `pnpm build`/`pnpm test` exercise everything under `src/Dependencies/`. The Light/full split only happens in `pnpm pack`.

## Development

```bash
pnpm install        # workspace root
composer install
pnpm dev:full       # wp-scripts watch build of the admin frontend (full edition)
pnpm dev:light      # wp-scripts watch build of the admin frontend (Light edition)
pnpm test           # vitest (frontend)
composer test       # phpunit
composer analyse    # phpstan
composer psalm
composer cs         # phpcs
pnpm pack           # builds both editions: loopress-light.zip and loopress-full.zip
pnpm pack:light     # loopress-light.zip only
pnpm pack:full      # loopress-full.zip only
```
