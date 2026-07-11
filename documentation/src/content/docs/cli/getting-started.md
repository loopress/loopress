---
title: CLI - Getting Started
description: Install and configure the Loopress CLI to connect to your WordPress instances.
---

The Loopress CLI (`lps`) is a Node.js command-line tool for version-controlling WordPress data and syncing it between your local machine and any WordPress instance.

## Installation

```bash
npm install -g @loopress/cli
```

Or with pnpm:

```bash
pnpm add -g @loopress/cli
```

Verify the installation:

```bash
lps --version
```

## Requirements

- Node.js 18+
- The [Loopress WordPress plugin](/wordpress-plugin/), installed and active on the site you want to manage
- A WordPress installation with either [WPCode](https://wpcode.com/) or [Code Snippets](https://wordpress.org/plugins/code-snippets/) active (for snippet commands; the Loopress WordPress plugin detects whichever one is installed)
- A WordPress administrator account. `lps project config` creates the [Application Password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/) used for authentication automatically, no manual setup needed

## Log in to Loopress

Authenticate with your Loopress account to unlock cloud features:

```bash
lps login
```

This opens `console.loopress.dev` in your browser. After you approve, the CLI stores a token in `$XDG_DATA_HOME/loopress/auth.json`, or `~/.local/share/loopress/auth.json` if that variable is unset, and returns you to the terminal.

```bash
lps logout   # Remove the stored token
```

## Error reporting

Loopress sends crash reports to Sentry so bugs can be found and fixed. A crash report includes the command name, its flags/args as typed, your Node.js version, and OS. WordPress credentials are never included.

To opt out:

```bash
lps telemetry disable   # Persists across all future commands
lps telemetry enable    # Re-enable
```

Or set `LOOPRESS_TELEMETRY_DISABLED=1` to override the persisted preference for a single run, useful in CI.

## Configure a project

Before running any command, register your WordPress site as a project:

```bash
lps project config
```

You will be prompted for:

| Prompt | Description |
|--------|-------------|
| Project name | A local identifier, lowercase, no spaces (e.g. `my-site`) |
| Environment | `production`, `staging`, `development`, or a custom name |
| WordPress URL | Full URL including scheme (`https://example.com`) |
| How to authenticate | **Authorize in my browser (recommended)** or **Enter credentials manually** |

By default the CLI runs a quick diagnostic against your site, then opens your browser to log in to WordPress and creates an Application Password for you automatically, no copy-pasting required. If the diagnostic fails or the browser flow can't complete, it falls back to manual entry (WordPress username + an Application Password you generate yourself under **Users → Profile → Application Passwords**, see [troubleshooting](/cli/application-passwords/) if the section is missing). You can also choose manual entry upfront from the authentication prompt.

### Manage multiple projects and environments

Loopress stores configurations in `$XDG_CONFIG_HOME/loopress/config.json`, or `~/.config/loopress/config.json` if that variable is unset, and tracks the currently active project and environment.

```bash
lps project config          # Add or update a project/environment
lps project list            # Show all configured projects and their environments
lps project switch          # Interactively pick the active project and environment
lps project remove          # Remove a saved project or environment
lps project sync            # Push local projects, environments and credentials to your Loopress account
```

All commands operate against the **active project/environment**.

### Syncing with your Loopress account

`lps project sync` requires being logged in (`lps login`). It creates a matching project and environment on your Loopress account for each one configured locally, then pushes the WordPress application password as credentials for that environment. Run it again after adding new projects or environments locally, it only creates what's missing and always refreshes credentials.

## Project-level configuration

Run `lps init` in your project root to generate `loopress.json` interactively, or create it manually:

```json
{
  "projectId": "my-site",
  "rootDir": "./wp-content",
  "snippetsDir": "snippets",
  "plugins": {
    "woocommerce": "9.0.2",
    "contact-form-7": "5.9.8"
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `projectId` | none | Name of the project to use, as configured via `lps project config`. Overrides the currently active project. |
| `rootDir` | `.` | Base directory, all other paths are resolved relative to it |
| `snippetsDir` | `snippets` | Directory for snippet files |
| `plugins` | none | Pinned plugin versions (slug → version). Managed by `lps plugin pull/push/add`. |

The `plugins` field is populated automatically by `lps plugin pull` and `lps plugin add`. Commit `loopress.json` to Git so every environment can be synced with `lps plugin push`.

## Dry run

Most commands accept a dry-run flag (`-d`) that shows what would happen without making any changes. Note that snippet commands use `--dryRun` (camelCase) while plugin and composer commands use `--dry-run`:

```bash
lps snippet push --dryRun
lps snippet pull --dryRun
lps plugin push --dry-run
lps composer push --dry-run
```
