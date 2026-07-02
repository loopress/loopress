---
title: Loopress CLI
description: Version-control your WordPress code snippets and plugins in Git.
---

The Loopress CLI (`lps`) is a Node.js command-line tool that connects to the WordPress REST API to sync code snippets and plugins between your local machine and any WordPress instance.

## Command overview

| Group | Command | Description |
|-------|---------|-------------|
| **Auth** | `lps login` | Log in to Loopress via the console |
| | `lps logout` | Log out from Loopress console |
| **Setup** | `lps init` | Create a `loopress.json` config file interactively |
| **Snippets** | `lps snippet pull` | Pull snippets from WordPress |
| | `lps snippet push` | Push snippets to WordPress |
| | `lps snippet list` | List all snippets on the site |
| **Plugins** | `lps plugin pull` | Pull installed plugins from WordPress into `loopress.json` |
| | `lps plugin push` | Sync plugins on WordPress to match `loopress.json` |
| | `lps plugin add` | Add a plugin to `loopress.json` (WordPress.org slug or Composer package) |
| **Composer** | `lps composer pull` | Pull `composer.lock` from the WordPress server |
| | `lps composer push` | Upload `composer.json` and `composer.lock` to WordPress and run `composer install` |
| **Project** | `lps project config` | Add or update a WordPress project environment |
| | `lps project list` | List configured WordPress projects |
| | `lps project switch` | Switch the active project |
| | `lps project switch-env` | Switch the active environment within the current project |
| | `lps project remove` | Remove one or more WordPress project configurations |
| | `lps project remove-env` | Remove one or more environments from the current project |

## Quick start

```bash
# 1. Initialize your project config
lps init

# 2. Pull your snippets
lps snippet pull

# 3. Edit, commit, push
git add snippets/ && git commit -m "update snippet"
lps snippet push
```

→ [Full setup guide](/cli/getting-started/)

## Authentication

All commands authenticate against WordPress using an [Application Password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/). These are generated in **Users → Profile → Application Passwords**.

The CLI supports managing multiple projects (`lps project config`) and switching between them (`lps project switch`).
