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
- A WordPress installation with the [WPCode](https://wpcode.com/) plugin active (for snippet commands; [Code Snippets](https://wordpress.org/plugins/code-snippets/) is also supported via `--plugin code-snippets`)
- A WordPress [Application Password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/) for authentication

## Log in to Loopress

Authenticate with your Loopress account to unlock cloud features:

```bash
lps login
```

This opens `console.loopress.dev` in your browser. After you approve, the CLI stores a token in `~/.loopress/auth.json` and returns you to the terminal.

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
| Application password | Generated in **Users → Profile → Application Passwords** (see [troubleshooting](/cli/application-passwords/) if the section is missing) |

### Manage multiple projects and environments

Loopress stores configurations in `~/.loopress/config.json` and tracks the currently active project and environment.

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

Run `lps init` in your project root to generate `loopress.json` interactively, or create it manually:

```json
{
  "projectId": "my-site",
  "snippetPlugin": "wpcode",
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
| `projectId` | — | Name of the project to use, as configured via `lps project config`. Overrides the currently active project. |
| `snippetPlugin` | `wpcode` | Snippet plugin to use: `wpcode` or `code-snippets` |
| `rootDir` | `.` | Base directory, all other paths are resolved relative to it |
| `snippetsDir` | `snippets` | Directory for snippet files |
| `plugins` | — | Pinned plugin versions (slug → version). Managed by `lps plugin pull/push/add`. |

The `plugins` field is populated automatically by `lps plugin pull` and `lps plugin add`. Commit `loopress.json` to Git so every environment can be synced with `lps plugin push`.

## Dry run

Most commands accept a dry-run flag (`-d`) that shows what would happen without making any changes. Note that snippet commands use `--dryRun` (camelCase) while plugin and composer commands use `--dry-run`:

```bash
lps snippet push --dryRun
lps snippet pull --dryRun
lps plugin push --dry-run
lps composer push --dry-run
```
