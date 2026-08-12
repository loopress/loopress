# Loopress

Make WordPress reproducible: sync ACF field groups, SEO settings, code snippets, Composer
dependencies, pages, forms, and custom REST routes between WordPress and a Git repository, driven
by a single CLI. Configuration as code, version control, reproducible environments, instead of
clicking through wp-admin and hoping staging matches production.

[loopress.dev](https://loopress.dev) · [Documentation](https://docs.loopress.dev) ·
[Security policy](./SECURITY.md) · [Status](https://claude.loopress.dev)

## What's in this repo

This is the `loopress/loopress` pnpm workspace: the CLI, the companion WordPress plugin, the
marketing site, and the docs all live and version together here.

| Package | What it is |
| --- | --- |
| [`cli/`](./cli) | `@loopress/cli`, the `lps` command. Talks to the WordPress plugin's REST API to pull/push everything. |
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

[MPL-2.0](./LICENSE)
