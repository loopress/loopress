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
| | `lps snippet publish` | Publish snippets to your Loopress account so they can be deployed to other projects |
| **ACF** | `lps acf pull` | Pull ACF field groups, post types, taxonomies and options pages from WordPress |
| | `lps acf push` | Push ACF configuration to WordPress |
| | `lps acf list` | List ACF objects on the site |
| **SEO** | `lps seo pull` | Pull SEO settings, post meta, and redirects from WordPress (RankMath or Yoast) |
| | `lps seo push` | Push SEO configuration to WordPress |
| | `lps seo list` | Print posts with SEO meta, and redirects if supported |
| **Plugins** | `lps plugin pull` | Pull installed plugins from WordPress into `loopress.json` |
| | `lps plugin push` | Push plugins to WordPress to match `loopress.json` |
| | `lps plugin add` | Add a WordPress.org plugin to `loopress.json` |
| **Composer** | `lps composer pull` | Pull `composer.lock` from WordPress |
| | `lps composer push` | Push `composer.json` and `composer.lock` to WordPress and run `composer install` |
| **Project** | `lps project config` | Add or update a WordPress project environment |
| | `lps project list` | List configured WordPress projects |
| | `lps project switch` | Switch the active project and environment |
| | `lps project remove` | Remove one or more WordPress projects or environments |
| | `lps project push` | Push locally configured projects, environments and credentials to your Loopress account |
| | `lps project pull` | Pull projects and environments from your Loopress account that aren't configured locally yet |
| **Telemetry** | `lps telemetry enable` | Enable error reporting to Sentry |
| | `lps telemetry disable` | Disable error reporting to Sentry |

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

→ [Full 3-minute setup guide](/getting-started/)

## Authentication

All commands authenticate against WordPress using an [Application Password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/). By default, `lps project config` creates one automatically by authorizing in your browser. Generating one manually under **Users → Profile → Application Passwords** is available as a fallback.

The CLI supports managing multiple projects (`lps project config`) and switching between them (`lps project switch`).
