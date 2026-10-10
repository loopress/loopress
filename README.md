# Loopress

[![npm](https://img.shields.io/npm/v/@loopress/cli)](https://www.npmjs.com/package/@loopress/cli)
[![License: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-blue)](./LICENSE)
![WordPress 6.0+](https://img.shields.io/badge/WordPress-6.0%2B-21759b)
![PHP 8.2+](https://img.shields.io/badge/PHP-8.2%2B-777bb4)

**Build, review and ship WordPress, in one loop.**

Loopress turns the parts of WordPress that are not content, configuration and code, into files in
your repo. You edit them, review them in a PR, push them to any environment, and roll them back.
Posts, orders and users never move.

```bash
npm i -g @loopress/cli
lps project config   # connect a site, installs the plugin
lps pull             # the site, as files
```

[loopress.dev](https://loopress.dev) · [Documentation](https://docs.loopress.dev) ·
[Demo project](https://github.com/loopress/demo) · [Security policy](./SECURITY.md)

## The loop

```text
   ┌────────────── build ───────────────┐
   │  acf/  seo/  menus/  cpt/  hooks/  │
   │  api/  apps/  loopress.json        │
   └──────────────────┬─────────────────┘
                      │  git commit
   ┌────────────── review ──────────────┐
   │  lps diff --env staging            │
   │  a short diff, in a real PR        │
   └──────────────────┬─────────────────┘
                      │  merge
   ┌─────────────── ship ───────────────┐
   │  lps push --env staging            │
   │  lps promote staging production    │
   │  each push is snapshotted,         │
   │  undo with lps <resource> rollback │
   └──────────────────┬─────────────────┘
                      │  meanwhile, someone edits wp-admin
                      │  lps diff spots it, lps pull brings it back
                      └──────────────── ↺ build
```

## Why

If you look after several WordPress sites, most of what can break them lives in the database:
field groups, SEO settings, menus, a snippet someone pasted in the admin. None of it has a
history, a review, or an undo. Loopress gives it all three, without asking you to restructure the
site or move hosts.

## Light or Full

Same plugin, two builds. Light syncs configuration and is on WordPress.org. Full adds code, which
WordPress.org does not allow a plugin to deploy, so it ships from loopress.dev. Both are free.

| | Light | Full |
| --- | :---: | :---: |
| ACF field groups, post types, taxonomies | ✓ | ✓ |
| SEO (Rank Math, Yoast) | ✓ | ✓ |
| Menus, options, block theme styles | ✓ | ✓ |
| Custom post types (JSON files, like CPT UI in Git) | ✓ | ✓ |
| Hooks, filters, cron (PHP classes) | | ✓ |
| REST API routes | | ✓ |
| Apps (React, Vue, Svelte bundles) | | ✓ |
| Pages, snippets, forms | | ✓ |
| Plugin and theme lockfile, Composer | | ✓ |
| Get it | [WordPress.org](https://wordpress.org/plugins/loopress-light/) | [loopress.dev](https://docs.loopress.dev/wordpress-plugin/) |

## Code, with conventions

Not a framework. Just a few rules that make WordPress code readable: one class per file,
attributes instead of `add_action` calls scattered across `functions.php`, and a hook that throws
is logged instead of taking the site down.

```php
// hooks/vat-notice.php
class VatNotice
{
    #[Filter('woocommerce_get_price_html')]
    public function notice(string $html): string
    {
        return $html . ' <small>incl. VAT</small>';
    }
}
```

## Status

Alpha, moving fast. Issues and pull requests welcome.

---

## What's in this repo

This is the `loopress/loopress` pnpm workspace: the CLI, the companion WordPress plugin, the
marketing site, and the docs all live and version together here.

| Package | What it is |
| --- | --- |
| [`cli/`](./cli) | `@loopress/cli`, the `lps` command. Talks to the WordPress plugin's REST API to pull/push everything. |
| [`mcp/`](./mcp) | `@loopress/mcp`, the `lps-mcp` MCP server. Exposes CLI operations as tool calls for AI agents. |
| [`wordpress-plugin/`](./wordpress-plugin) | The WordPress plugin (`loopress`) the CLI talks to. Ships as two editions, Light (wordpress.org) and Full (loopress.dev only), from one codebase. |
| [`website/`](./website) | The loopress.dev marketing site (Astro + React). |
| [`documentation/`](./documentation) | The docs site (Astro + Starlight) at docs.loopress.dev. |
| [`e2e/`](./e2e) | Playwright tests running the real built CLI against a real, disposable WordPress instance. |
| [`assets/`](./assets) | Shared brand assets (`@loopress/assets`: logo, icons) consumed by the plugin and the website. |
| [`eslint-config/`](./eslint-config) | Shared ESLint config (`@loopress/eslint-config`) for the JS/TS packages. |

Each package has its own README with the details, this one is just the map.

## Requirements

- Node 24.x
- pnpm (version pinned in `package.json`'s `packageManager`, run via `corepack enable` or install
  it directly)
- PHP + Composer for `wordpress-plugin/` (see its own README)

## Getting started

```bash
pnpm install   # installs the whole workspace from the repo root
```

Then jump into whichever package you're working on:

```bash
cd cli && pnpm dev                # CLI, watch mode
cd wordpress-plugin && composer install && pnpm dev:full   # plugin admin UI, watch mode
cd website && pnpm dev            # marketing site
cd documentation && pnpm dev      # docs site
```

## Testing

- **Unit tests**: run inside each package (`pnpm test` in `cli/`, `composer test` in
  `wordpress-plugin/`). No network, no WordPress instance needed.
- **E2E tests** (`e2e/`): the real CLI against a real, disposable WordPress instance. See
  [`e2e/README.md`](./e2e/README.md) for how to point them at one, locally or via the same Docker
  stack CI uses.

## Links

- [CLI mutation report](https://loopress.github.io/loopress/mutations/cli) (Stryker)
- [WordPress plugin mutation report](https://loopress.github.io/loopress/mutations/wordpress-plugin) (Infection)

Both are rebuilt on every push to `main` (see `.github/workflows/mutation-report.yml`) and
published to GitHub Pages. Report-only for now, not a merge gate, the plugin job runs with
`continue-on-error: true` (see `wordpress-plugin/infection.json5`).

## Releasing

Versioning and changelogs are managed with [Changesets](https://github.com/changesets/changesets).
Run `pnpm changeset` when a PR changes published package behavior, and describe it as a patch,
minor, or major bump for whichever package(s) it touches.

## License

[MPL-2.0](./LICENSE), except the WordPress plugin, which is
[GPL](./wordpress-plugin/LICENSE) like WordPress itself.
