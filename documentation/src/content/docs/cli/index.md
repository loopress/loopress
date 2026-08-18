---
title: Loopress CLI
description: Version-control your WordPress code snippets and plugins in Git.
---

The Loopress CLI (`lps`) is a Node.js command-line tool that connects to the WordPress REST API to sync code snippets and plugins between your local machine and any WordPress instance.

The [Loopress WordPress plugin](/wordpress-plugin/) must be installed and active on the site you want to manage.

## Command overview

Commands for managing the tool itself, your projects, and your Loopress account:

| Group | Command | Description |
|-------|---------|-------------|
| **Auth** | `lps login` | Log in to the Loopress console |
| | `lps logout` | Log out from the Loopress console |
| **Setup** | `lps init` | Create a `loopress.json` config file interactively |
| | `lps status` | Show which project and environment commands will target |
| | `lps doctor` | Diagnose connectivity, plugin and credential problems |
| | `lps dev` | Watch snippets, pages, API routes and plugins, pushing each change to the `local` environment automatically |
| | `lps push` | Push plugins, composer, ACF, API routes, forms, pages, SEO, and snippets to WordPress in one command |
| **Project** | `lps project config` | Add or update a WordPress project environment |
| | `lps project list` | List configured WordPress projects |
| | `lps project switch` | Switch the active project and environment |
| | `lps project remove` | Remove one or more WordPress projects or environments |
| | `lps project push` | Push locally configured projects, environments and credentials to your Loopress account |
| | `lps project pull` | Pull projects and environments from your Loopress account that aren't configured locally yet |
| | `lps project rotate` | Rotate the WordPress application password for a project |
| **Telemetry** | `lps telemetry enable` | Enable error reporting to Sentry |
| | `lps telemetry disable` | Disable error reporting to Sentry |

## Features

Each of these syncs one kind of WordPress data as files in Git. See its own page for commands, flags, and file format:

- [Snippets](/snippets/): PHP/CSS/JS code snippets (Code Snippets or WPCode)
- [ACF](/acf/): Advanced Custom Fields configuration
- [SEO](/seo/): SEO settings, post meta, and redirects (RankMath or Yoast)
- [Forms](/forms/): WPForms forms
- [Pages](/pages/): WordPress pages
- [API Routes](/api/): custom REST API endpoints
- [Plugins](/plugins/): installed WordPress.org plugins manifest
- [Composer](/composer/): PHP dependencies, without SSH

Connecting an AI agent instead of a human? See the [MCP server](/cli/mcp/).

## Quick start

```bash
# 1. Connect to your WordPress site
lps project config

# 2. Initialize your project config
lps init

# 3. Pull your snippets
lps snippet pull

# 4. Edit, commit, push
git add snippets/ && git commit -m "update snippet"
lps snippet push
```

→ [Full CLI installation and setup guide](/cli/getting-started/)

## Authentication

All commands authenticate against WordPress using an [Application Password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/). By default, `lps project config` creates one automatically by authorizing in your browser. Generating one manually under **Users → Profile → Application Passwords** is available as a fallback.

The CLI supports managing multiple projects (`lps project config`) and switching between them (`lps project switch`).
