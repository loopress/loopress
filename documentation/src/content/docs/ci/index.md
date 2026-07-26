---
title: CI/CD Integration
description: Bootstrap a full WordPress environment in CI with a single step and run Loopress against it.
---

`loopress/setup-ci` starts MySQL and WordPress via Docker, installs WP-CLI, creates the REST credentials, and installs the Loopress CLI. Your pipeline can run `lps snippet push` immediately after.

## How it works

1. Starts MySQL 8 and WordPress via Docker Compose
2. Waits for WordPress to respond (up to 90 seconds)
3. Installs WP-CLI inside the WordPress container
4. Runs `wp core install` and creates an application password
5. Exports a clean database snapshot so you can reset back to it later between groups of tests, see each platform's "Restoring between groups of tests" section
6. Writes `$XDG_CONFIG_HOME/loopress/config.json` (or `~/.config/loopress/config.json`) with the site credentials
7. Installs `@loopress/cli`

## Token requirements

No token is needed to run `lps snippet push` or `lps plugin push` against a local WordPress instance.

A token is required only when deploying to a real site. Get one at [console.loopress.dev/tokens](https://console.loopress.dev/tokens).

## Deploying to a real environment

The ephemeral instance above is for tests. To deploy to a real site (staging, production), provide the project configuration as a CI secret and pick the environment per command with `--env`, instead of fabricating the active-environment state in the config file:

1. Configure the project once on your machine (`lps project config`).
2. Store your `config.json` (see its path under "How it works") as a CI secret file, and set `LOOPRESS_TOKEN`.
3. Target the environment explicitly in the pipeline:

```bash
lps doctor --env staging
lps snippet push --env staging --yes
```

`--env` targets an environment by name and does not depend on which environment was last active. `--yes` answers confirmations; pushing to an environment named `production` requires it in a non-interactive run.

## Supported platforms

- [GitHub Actions](/ci/github-actions/)
- [GitLab CI](/ci/gitlab/)

## Beyond syncing files

`loopress/setup-ci` boots a real WordPress instance, not a mock, so you can also drive it with a browser to test actual site behaviour. See [E2E Testing](/ci/e2e-testing/) for running Playwright against it with WordPress's own `@wordpress/e2e-test-utils-playwright` helpers.

## Full example

[github.com/loopress/demo](https://github.com/loopress/demo) is a small but complete reference project: `loopress.json`, versioned snippets, CI wired up on both GitHub Actions and GitLab CI, and a Playwright E2E suite.
