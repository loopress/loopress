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

The CLI checks npm in the background (at most once a day, never blocking a command) and prints a notice when a newer version exists. The CLI and the WordPress plugin evolve together, so staying current avoids debugging already-fixed issues:

```bash
npm install -g @loopress/cli
```

## Requirements

- Node.js 18+
- The [Loopress WordPress plugin](/wordpress-plugin/), installed and active on the site you want to manage. `lps project config` installs it for you automatically if it's missing, see below.
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

By default the CLI runs a quick diagnostic against your site, then opens your browser to log in to WordPress and creates an Application Password for you automatically, no copy-pasting required. If the diagnostic fails or the browser flow can't complete, it falls back to manual entry (WordPress username + an Application Password you generate yourself under **Users → Profile → Application Passwords**, see [troubleshooting](/application-passwords/) if the section is missing). You can also choose manual entry upfront from the authentication prompt.

If Loopress Full isn't active on the site yet, `project config` then offers to install it for you, after a confirmation prompt: it downloads the latest release, creates a temporary administrator account, uploads and activates the plugin through a headless local browser, then deletes the temporary account. This step is independent of which authentication mode you chose above. If the automatic install can't complete (some managed hosts block file uploads via `DISALLOW_FILE_MODS`), the command falls back to instructions for a manual upload, see [Installation](/wordpress-plugin/#installation).

### Manage multiple projects and environments

Loopress stores configurations in `$XDG_CONFIG_HOME/loopress/config.json`, or `~/.config/loopress/config.json` if that variable is unset, and tracks the currently active project and environment.

```bash
lps project config          # Add or update a project/environment
lps project list            # Show all configured projects and their environments
lps project switch          # Interactively pick the active project and environment
lps project remove          # Remove a saved project or environment
lps project push            # Push local projects, environments and credentials to your Loopress account
lps project pull            # Pull projects and environments from your Loopress account that aren't configured locally yet
```

All commands operate against the **active project/environment**. To target another environment for a single command, pass `--env` instead of switching globally:

```bash
lps snippet push --env staging
lps status --env staging     # preview what would be targeted
```

`--env` is available on every project-aware command, takes priority over the active environment, and errors with the list of available environments if the name does not exist. Because `lps project switch` mutates state shared by every terminal on the machine, `--env` is the safer choice in scripts.

### Syncing with your Loopress account

Both commands require being logged in (`lps login`).

`lps project push` creates a matching project and environment on your Loopress account for each one configured locally, then pushes the WordPress application password as credentials for that environment. Run it again after adding new projects or environments locally, it only creates what's missing and always refreshes credentials.

`lps project pull` fetches projects and environments already on your Loopress account and adds any that aren't configured locally yet, useful when setting up a new machine.

## Project-level configuration

Run `lps init` in your project root to generate `loopress.json` interactively, or create it manually:

```json
{
  "projectId": "my-site",
  "rootDir": "./wp-content",
  "snippetsDir": "snippets",
  "plugins": {
    "woocommerce": "latest",
    "contact-form-7": "latest"
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `projectId` | none | Name of the project to use, as configured via `lps project config`. Overrides the currently active project. |
| `rootDir` | `.` | Base directory, all other paths are resolved relative to it |
| `snippetsDir` | `snippets` | Directory for snippet files |
| `plugins` | none | WordPress.org plugins managed by Loopress (slugs). Managed by `lps plugin pull/push/add`. |

The `plugins` field is populated automatically by `lps plugin pull` and `lps plugin add`. Commit `loopress.json` to Git so every environment can be synced with `lps plugin push`.

## Dry run

Most commands accept `--dry-run` (`-d`), which shows what would happen without making any changes:

```bash
lps snippet push --dry-run
lps composer push --dry-run
```

## CI and non-interactive use

Without a TTY, or when the `CI` environment variable is set, the CLI never hangs waiting for a prompt:

- Confirmations take their default answer and log it. Pass `--yes` (`-y`) to answer yes explicitly.
- Commands that require interactive input (`lps init`, `lps project config`) fail immediately with instructions. Configure projects on your machine and commit `loopress.json`; in CI, target environments with `--env`.
- Pushing to an environment named `production` asks for confirmation in a terminal, and requires `--yes` in CI:

```bash
lps snippet push --env production --yes
```

- Pull commands that would delete local files no longer present on WordPress list them and ask first in a terminal. `--yes` skips the question; without a TTY the files are removed and reported, so existing scripts keep working.

## Troubleshooting

When a command fails and the cause is unclear, run [`lps doctor`](/cli/doctor/): it checks that the site is reachable, the plugin installed, and the credentials valid, each with a corrective action.
