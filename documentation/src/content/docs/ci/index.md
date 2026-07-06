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
5. Writes `~/.loopress/config.json` with the site credentials
6. Installs `@loopress/cli`

## Token requirements

No token is needed to run `lps snippet push` or `lps plugin push` against a local WordPress instance.

A token is required only when deploying to a real site. Get one at [console.loopress.dev/tokens](https://console.loopress.dev/tokens).

## Supported platforms

- [GitHub Actions](/ci/github-actions/)
- [GitLab CI](/ci/gitlab/)
