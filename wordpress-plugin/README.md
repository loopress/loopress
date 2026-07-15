# Loopress

WordPress plugin syncing code snippets (Code Snippets / WPCode) with the Loopress CLI. One codebase, two build editions (`scripts/build-flavor.cjs`):

- **free** (`loopress.zip`): snippet sync only, distributed on wordpress.org. Contains no Composer code at all, not even inactive: `src/Plus/` and `uninstall.php` are stripped at build time, and `composer.json` ships with an empty `require`.
- **plus** (`loopress-plus.zip`): everything in free, plus Composer dependency management (`src/Plus/`). Distributed only from loopress.dev, never wordpress.org: a plugin offering a UI to install packages from Packagist is not acceptable in the official directory (guidelines Rule 8), see `obsidian/Product/WordPress.org Plugin Distribution.md` in the monorepo. Ships with `Update URI: https://loopress.dev` so wordpress.org can never push an update over it, and deactivates the free edition on activation (the two editions never run side by side; both define `LOOPRESS_VERSION` and refuse to boot if it is already defined).

Development always targets the full (plus) feature set: `composer.json` at the repo root requires `composer/composer`, and `pnpm build`/`pnpm test` exercise everything under `src/Plus/`. The free/plus split only happens in `pnpm pack`.

## Development

```bash
pnpm install        # workspace root
composer install
pnpm dev            # wp-scripts watch build of the admin frontend (plus entry)
pnpm test           # vitest (frontend)
composer test       # phpunit
composer analyse    # phpstan
composer psalm
composer cs         # phpcs
pnpm pack           # builds both editions: loopress.zip and loopress-plus.zip
pnpm pack:free      # loopress.zip only
pnpm pack:plus      # loopress-plus.zip only
```
