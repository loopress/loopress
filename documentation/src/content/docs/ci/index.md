---
title: CI/CD Integration
description: Bootstrap a full WordPress environment in CI with a single step and run Loopress against it.
---

`loopress/setup-ci` starts MySQL and WordPress via Docker, installs WP-CLI, creates the REST credentials, and installs the Loopress CLI. Your pipeline can run `lps push` immediately after.

## How it works

1. Starts MySQL 8 and WordPress via Docker Compose
2. Waits for WordPress to respond (up to 90 seconds)
3. Installs WP-CLI inside the WordPress container
4. Runs `wp core install` and creates an application password
5. Exports a clean database snapshot so you can reset back to it later between groups of tests, see each platform's "Restoring between groups of tests" section
6. Writes `$XDG_CONFIG_HOME/loopress/config.json` (or `~/.config/loopress/config.json`) with the site credentials
7. Installs `@loopress/cli`

## Token requirements

No token is required to push, locally, in CI, or to a real site. `LOOPRESS_TOKEN` is only read for best-effort cloud features (deployment record, publish). Get one at [console.loopress.dev/tokens](https://console.loopress.dev/tokens) if you want them.

## Deploying to a real environment

The ephemeral instance above is for tests. To deploy to a real site (staging, production), provide the project configuration as a CI secret and pick the environment per command with `--env`, instead of fabricating the active-environment state in the config file:

1. Configure the project once on your machine (`lps project config`).
2. Store the export of the environment as a CI secret named `LOOPRESS_CONFIG`: `cfg=$(lps project export --env staging) && gh secret set LOOPRESS_CONFIG --body "$cfg"` (GitLab: `cfg=$(lps project export --env staging) && glab variable set LOOPRESS_CONFIG "$cfg" --type file --protected`). It holds that one environment only, not the other projects of your machine. Optionally set `LOOPRESS_TOKEN` for the cloud features.
3. Target the environment explicitly in the pipeline:

```bash
lps doctor --env staging
lps push --env staging --yes
```

`--env` targets an environment by name and does not depend on which environment was last active. `--yes` answers confirmations; pushing to an environment of type `production` (whatever its name) requires it in a non-interactive run, see below.

### Production needs a CI provider

Changing an environment of type `production` (push, promote, rollback, removals) without a terminal needs `--yes` **and** a CI provider the CLI recognizes. `--yes` alone in a plain shell is refused, and so is a bare `CI=true`: production is changed from a terminal, where you answer the prompt, or from a CI pipeline. This keeps an AI agent running commands in a shell from confirming a production change on its own. Other environment types are unchanged.

Providers are detected by [`ci-info`](https://www.npmjs.com/package/ci-info) from the variables each one sets (GitHub Actions, GitLab CI, CircleCI, Jenkins, Bitbucket Pipelines and many more), so a pipeline on one of them needs nothing extra.

Limits: detection reads environment variables, so setting one on purpose fakes a CI. An agent that runs inside your pipeline (an agent job in GitHub Actions or GitLab) passes the check too: there, rely on the pipeline's own protections (protected branch, required review, environment approval).

On a self-hosted or unknown CI, set your provider's usual variable (for instance `GITHUB_ACTIONS=true` or `GITLAB_CI=true`), or run the deploy interactively.

### Refreshing the secret

An application password is rotated every 90 days: the next `lps` command on your machine after that rotates it and revokes the old one, so the copy in your CI secret then gets a 401. CI never rotates (its config is thrown away after each job). The CLI prints a reminder when your machine rotates; run the same export command again to refresh the secret (GitLab: `glab variable update LOOPRESS_CONFIG "$cfg" --type file`, with `cfg` captured from `lps project export --env <name>` first; creating the variable again fails).

## Supported platforms

- [GitHub Actions](/ci/github-actions/)
- [GitLab CI](/ci/gitlab/)
- [Drift detection](/ci/drift-detection/)
- [Plugin update PRs](/ci/plugin-update-prs/)
- [Drift detection](/ci/drift-detection/) (scheduled GitHub Actions job)

## Beyond syncing files

`loopress/setup-ci` boots a real WordPress instance, not a mock, so you can also drive it with a browser to test actual site behaviour. See [E2E Testing](/ci/e2e-testing/) for running Playwright against it with WordPress's own `@wordpress/e2e-test-utils-playwright` helpers.

## Full example

[github.com/loopress/demo](https://github.com/loopress/demo) is a small but complete reference project: `loopress.json`, versioned snippets, CI wired up on both GitHub Actions and GitLab CI, and a Playwright E2E suite.
