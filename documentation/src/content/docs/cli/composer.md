---
title: Composer
description: Sync composer.json and composer.lock between your local machine and WordPress without SSH.
---

The `composer` command group lets you synchronize your Composer setup with a WordPress server. This is useful when you manage PHP dependencies locally (or with the Loopress WordPress plugin) and need to keep remote environments in sync.

## Commands

### `lps composer push`

Upload `composer.json` and `composer.lock` to WordPress and run `composer install` on the server.

```bash
lps composer push
```

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be sent without making any changes |

If a `composer.lock` is present, the server runs a reproducible install. If no lock file is found, the server resolves versions freely and a warning is shown.

**Example output:**

```console
Pushing composer.json (3 packages) to https://example.com
  + composer.lock included (reproducible install)
composer install completed on the server.
```

---

### `lps composer pull`

Download the current `composer.lock` from the WordPress server to your local directory.

```bash
lps composer pull
```

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be written without touching the filesystem |

The file is written to the path resolved from `rootDir` in `loopress.json` (defaults to the current directory).

---

## Typical workflow

```bash
# 1. Add a dependency locally
composer require tecnickcom/tcpdf

# 2. Push the updated composer.json and lock to the server
lps composer push

# 3. Pull the lock back if the server resolved it differently
lps composer pull
```

## Relation to the WordPress plugin

The `lps composer push` command uses the same REST endpoint (`/wp-json/loopress/v1/composer/sync`) as the WordPress plugin's **Dependency Management** panel. Both tools write to `wp-content/loopress/`. You can use either depending on your workflow: the admin panel for interactive installs, the CLI for scripted or CI deployments.
