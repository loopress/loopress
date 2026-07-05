---
title: Loopress CLI
description: Version-control your WordPress code snippets and plugins in Git.
---

The Loopress CLI (`lps`) is a Node.js command-line tool that connects to the WordPress REST API to sync code snippets and plugins between your local machine and any WordPress instance.

The [Loopress WordPress plugin](/wordpress-plugin/) must be installed and active on the site you want to manage.

## Command overview

| Group | Command | Description |
|-------|---------|-------------|
| **Auth** | `lps login` | Log in to the Loopress console |
| | `lps logout` | Log out from the Loopress console |
| **Setup** | `lps init` | Create a `loopress.json` config file interactively |
| | `lps status` | Show which project and environment commands will target |
| **Snippets** | `lps snippet pull` | Pull snippets from WordPress |
| | `lps snippet push` | Push snippets to WordPress |
| | `lps snippet list` | List all snippets on the site |
| **Plugins** | `lps plugin pull` | Pull installed plugins from WordPress into `loopress.json` |
| | `lps plugin push` | Push plugins to WordPress to match `loopress.json` |
| | `lps plugin add` | Add a WordPress.org plugin to `loopress.json` |
| **Composer** | `lps composer pull` | Pull `composer.lock` from WordPress |
| | `lps composer push` | Push `composer.json` and `composer.lock` to WordPress and run `composer install` |
| **Project** | `lps project config` | Add or update a WordPress project environment |
| | `lps project list` | List configured WordPress projects |
| | `lps project switch` | Switch the active project and environment |
| | `lps project remove` | Remove one or more WordPress projects or environments |
| | `lps project sync` | Sync locally configured projects and environments with your Loopress account |

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

→ [Full 3-minute setup guide](/guides/getting-started/)

## Authentication

All commands authenticate against WordPress using an [Application Password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/). These are generated in **Users → Profile → Application Passwords**.

The CLI supports managing multiple projects (`lps project config`) and switching between them (`lps project switch`).
