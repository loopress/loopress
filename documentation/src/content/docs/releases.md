---
title: Releases and compatibility
description: Supported WordPress, PHP and Node versions, how the CLI and the plugin are versioned, what Alpha means, and how to pin a version.
---

Loopress is in Alpha. This page says what that means today, what is supported, and how the CLI and the WordPress plugin versions relate.

## Supported versions

| Component | Requirement |
|-----------|-------------|
| WordPress | 6.2 or newer (the plugin is tested up to 7.1) |
| PHP | 8.2 or newer, on the server |
| Node.js | 22 or newer, on your machine, for the CLI |
| Chrome, Edge or Chromium | Only for the automatic plugin install of `lps project config` |

The WordPress and PHP requirements are the same for Loopress Light and Loopress Full.

## Version scheme

The CLI and the plugin are versioned separately.

- **WordPress plugin**: CalVer, `YYYY.N.P`. `YYYY` is the year, `N` goes up for a feature, `P` for a fix. Loopress Light and Loopress Full share the same number.
- **CLI (`@loopress/cli`) and MCP server (`@loopress/mcp`)**: plain semver, `0.x.y` until 1.0. The two are released together with the same number.

A CLI release and a plugin release do not share a number.

## When the CLI and the plugin differ

The CLI does not compare version numbers. Before acting on a site, it asks the plugin what it can do (`GET loopress/v1/capabilities`: edition, active modules, detected integrations) and works from that answer:

- If the plugin is too old to answer (the route does not exist, or the answer lists no modules), the CLI stops with "The Loopress plugin on `<site>` is too old for this CLI. Update it, then try again."
- If the site cannot hold a kind of resource, the command says so and what to do about it instead of failing on the server's error. For instance, hooks, API routes, apps, pages and snippets answer "need Loopress Full" on Loopress Light, and ACF or forms say which plugin is not active.
- `lps doctor` prints the plugin edition and version it found.

Nothing else is checked: a plugin newer or older than the CLI that still answers the capabilities route is not refused or warned about. To avoid surprises, update both together.

## What Alpha means

- **No migration before 1.0.** A change to the project layout or to `loopress.json` can break an existing project, and no migration or fallback is provided. The change is described in the changelog, and you update your project by hand.
- **Breaking changes are marked.** A changelog entry that breaks something starts with "Breaking:".
- **Changelogs.** `CHANGELOG.md` in the CLI, MCP and plugin packages of the [loopress repository](https://github.com/loopress/loopress), rendered together at [loopress.dev/changelog](https://loopress.dev/changelog).

No deprecation policy or support window is promised before 1.0.

## Pin a version

Install a given CLI version from npm:

```bash
npm install -g @loopress/cli@0.36.0   # or: pnpm add -g @loopress/cli@0.36.0
lps --version
```

Keep the plugin on a release from the same period as that CLI version: the [changelog](https://loopress.dev/changelog) lists every release of both, and `lps doctor` shows the plugin version a site runs.
