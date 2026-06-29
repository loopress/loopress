---
title: Loopress CLI
description: Version-control your WordPress code snippets and plugins in Git.
---

The Loopress CLI (`lps`) is a Node.js command-line tool that connects to the WordPress REST API to sync code snippets and plugins between your local machine and any WordPress instance.

## Command overview

| Group | Command | Description |
|-------|---------|-------------|
| **Auth** | `lps login` | Log in to Loopress via the console |
| | `lps logout` | Remove the stored authentication token |
| **Snippets** | `lps snippet pull` | Download snippets from WordPress |
| | `lps snippet push` | Upload local snippet files to WordPress |
| | `lps snippet list` | List all snippets on the site |
| **Plugins** | `lps plugin pull` | Snapshot installed plugin versions into `loopress.json` |
| | `lps plugin push` | Sync WordPress plugins to match `loopress.json` |
| | `lps plugin require` | Add a plugin to `loopress.json` (resolves version from WordPress.org) |
| **Project** | `lps project config` | Add or update a project/environment credential |
| | `lps project list` | List all configured projects |
| | `lps project switch` | Switch the active project |
| | `lps project switch-env` | Switch the active environment |
| | `lps project remove` | Remove a saved project |
| | `lps project remove-env` | Remove a saved environment |

## Quick start

```bash
# 1. Configure your first project
lps project config

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
