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
- A WordPress installation with the [Code Snippets](https://wordpress.org/plugins/code-snippets/) plugin active (for snippet commands)
- A WordPress [Application Password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/) for authentication

## Log in to Loopress

Authenticate with your Loopress account to unlock cloud features:

```bash
lps login
```

This opens `console.loopress.dev` in your browser. After you approve, the CLI stores a token in `~/.lps/auth.json` and returns you to the terminal.

```bash
lps logout   # Remove the stored token
```

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
| Username | Your WordPress administrator username |
| Application password | Generated in **Users → Profile → Application Passwords** |

### Manage multiple projects and environments

Loopress stores configurations in `~/.lps/config.json` and tracks the currently active project and environment.

```bash
lps project config          # Add or update a project/environment
lps project list            # Show all configured projects and their environments
lps project switch          # Interactively pick the active project
lps project switch-env      # Interactively pick the active environment
lps project remove          # Remove a saved project
lps project remove-env      # Remove a saved environment
```

All commands operate against the **active project/environment**.

## Project-level configuration

Place a `loopress.json` file in your project root to customise paths and track managed plugins:

```json
{
  "rootDir": "./wp-content",
  "snippets": "snippets",
  "plugins": {
    "woocommerce": "9.0.2",
    "contact-form-7": "5.9.8"
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `rootDir` | `.` | Base directory — all other paths are resolved relative to it |
| `snippets` | `snippets` | Directory for snippet files |
| `plugins` | — | Pinned plugin versions (slug → version). Managed by `lps plugin pull/push/require`. |

The `plugins` field is populated automatically by `lps plugin pull` and `lps plugin require`. Commit `loopress.json` to Git so every environment can be synced with `lps plugin push`.

## Dry run

Most commands accept a `--dry-run` (`-d`) flag that shows what would happen without making any changes:

```bash
lps snippet push --dry-run
lps snippet pull --dry-run
lps plugin push --dry-run
```
