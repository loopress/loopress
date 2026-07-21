# Loopress

WordPress plugin syncing ACF field groups, SEO settings (Yoast, RankMath), code snippets (Code Snippets / WPCode), and Composer dependencies with the Loopress CLI. One codebase, two build editions (`scripts/build-flavor.cjs`, internal flavor arguments `light`/`full`):

- **Loopress Light** (`loopress-light.zip`): ACF and SEO sync only, distributed on wordpress.org. Contains no Composer or snippet-sync code at all, not even inactive: `src/Dependencies/`, `src/Snippets/`, and `uninstall.php` are stripped at build time, and `composer.json` ships with an empty `require`. wordpress.org rejected snippet sync itself as a remote arbitrary-code-deployment mechanism, on top of the earlier Composer rejection, so `src/Snippets/` is excluded from this edition on the same footing as `src/Dependencies/`; see `obsidian/Product/WordPress.org Plugin Distribution.md` §2b in the monorepo.
- **Loopress Full** (`loopress-full.zip`): everything in Loopress Light, plus code snippet sync (`src/Snippets/`) and Composer dependency management (`src/Dependencies/`). Distributed only from loopress.dev, never wordpress.org. Ships with `Update URI: https://loopress.dev` so wordpress.org can never push an update over it, and deactivates Loopress Light on activation (the two editions never run side by side; both define `LOOPRESS_VERSION` and refuse to boot if it is already defined).

Development always targets the full (Loopress Full) feature set: `composer.json` at the repo root requires `composer/composer`, and `pnpm build`/`pnpm test` exercise everything under `src/Dependencies/` and `src/Snippets/`. The Light/full split only happens in `pnpm pack`.

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
