---
title: CLI
description: Sync composer.json and composer.lock between your local machine and WordPress without SSH.
---

:::note
The `composer` command group talks to REST endpoints provided by [Loopress Full](/wordpress-plugin/), the free full edition of the plugin, not Loopress Light. Install it on the site before using these commands.
:::

The `composer` command group lets you synchronize your Composer setup with a WordPress server. This is useful when you manage PHP dependencies locally (or with Loopress Full) and need to keep remote environments in sync.

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

The command waits for the server-side `composer install` to finish, up to 10 minutes. A cold install with many packages can take a while: this is expected. If the call does time out, the install may still be running on the server, so check the site before retrying.

**Example output:**

```console
Pushing composer.json (3 packages) to https://example.com
  + composer.lock included (reproducible install)
Running composer install on the server, this can take a few minutes...
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

The `lps composer push` command uses the same REST endpoint (`/wp-json/loopress/v1/composer/sync`) as Loopress Full's [Admin UI](/composer/admin-ui/) panel. Both tools write to `wp-content/loopress/`. You can use either depending on your workflow: the admin panel for interactive installs, the CLI for scripted or CI deployments.
