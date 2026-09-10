---
title: CLI
description: Sync composer.json and composer.lock between your local machine and WordPress without SSH.
---

:::note
The `composer` command group talks to REST endpoints provided by [Loopress Full](/wordpress-plugin/), the free full edition of the plugin, not Loopress Light. Install it on the site before using these commands.
:::

The `composer` command group lets you synchronize your Composer setup with a WordPress server. This is useful when you manage PHP dependencies locally (or with Loopress Full) and need to keep remote environments in sync.

## Commands

### `lps composer init`

Create a `composer.json` in your project, wired to the [WPackagist](https://wpackagist.org/) repository so you can require WordPress.org plugins and themes as Composer packages. Run it once, at the path resolved from `rootDir` in `loopress.json`.

```bash
lps composer init
```

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show where the file would be written without creating it |

Once a `composer.json` exists in the repo it is authoritative for plugins and themes: `lps plugin` and `lps theme` then defer to `lps composer`, see [Where the Composer files live](/plugins/#where-the-composer-files-live). If the file already exists, `lps composer init` asks before overwriting, and does nothing in a non-interactive terminal.

---

### `lps composer push`

Upload `composer.json` to WordPress and run Composer on the server to resolve and install the dependencies.

```bash
lps composer push
```

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be sent without making any changes |

The server always resolves `composer.json` itself, against its own Packagist and WPackagist repositories. It never installs from an uploaded `composer.lock`: a hand-crafted lock could point package downloads at arbitrary hosts, so the plugin stays the sole authority on where dependencies come from. Pin exact versions in `composer.json` if you need a specific build.

If a local `composer.lock` is present it is still sent, but only so the server can report which of your pinned versions its own resolution moved. The command prints that drift and tells you to run `lps composer pull` to bring the server-resolved `composer.lock` back down.

The command waits for the server-side Composer run to finish, up to 10 minutes. A cold run with many packages can take a while: this is expected. If the call does time out, Composer may still be running on the server, so check the site before retrying.

**Example output:**

```console
Pushing composer.json (3 packages) to https://example.com
  + composer.lock sent for drift comparison (the server resolves versions from composer.json)
Running Composer on the server, this can take a few minutes...
Composer run completed on the server.

The server resolved 1 package to a different version than your local composer.lock:
  monolog/monolog: 3.5.0 -> 3.7.0
Run `lps composer pull` to update your local composer.json and composer.lock.
```

---

### `lps composer pull`

Download `composer.json` from the WordPress server, plus `composer.lock` when the server has one, to your local directory.

```bash
lps composer pull
```

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be written without touching the filesystem |

The files are written to the path resolved from `rootDir` in `loopress.json` (defaults to the current directory). A site that has never had dependencies pushed has no `composer.lock` yet, so only `composer.json` is written in that case.

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
