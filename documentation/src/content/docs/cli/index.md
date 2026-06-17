---
title: Loopress CLI
description: Version-control your WordPress code snippets in Git.
---

The Loopress CLI (`lps`) is a Node.js command-line tool that connects to the WordPress REST API to sync code snippets between your local machine and any WordPress instance.

## Command overview

| Group | Command | Description |
|-------|---------|-------------|
| **Snippets** | `lps snippets pull` | Download snippets from WordPress |
| | `lps snippets push` | Upload local `.php` files to WordPress |
| | `lps snippets list` | List all snippets on the site |
| **Site** | `lps site config` | Add or update a site credential |
| | `lps site switch` | Switch the active site |
| | `lps site remove` | Remove a saved site |

## Quick start

```bash
# 1. Configure your first site
lps site config

# 2. Pull your snippets
lps snippets pull

# 3. Edit, commit, push
git add snippets/ && git commit -m "update snippet"
lps snippets push
```

→ [Full setup guide](/cli/getting-started/)

## Authentication

All commands authenticate using a WordPress [Application Password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/). These are generated in **Users → Profile → Application Passwords**.

The CLI supports managing multiple sites (`lps site config`) and switching between them (`lps site switch`). For CI environments, credentials can be passed as environment variables (`WP_URL`, `WP_USERNAME`, `WP_APP_PASSWORD`).
