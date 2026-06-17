---
title: Getting Started
description: Install the Loopress plugin and CLI and run your first snippet sync.
---

Loopress is made up of two independent tools. You can use one, the other, or both depending on your needs.

## Wordpress Plugin

Install the plugin on your WordPress site to manage Composer packages from the admin panel, no SSH or server access required.

→ [Learn more about the plugin](/wordpress-plugin/)

## Loopress CLI

Install the CLI to version-control your code snippets as plain `.php` files in Git and sync them to any WordPress instance.

→ [Learn more about the CLI](/cli/)

## Prerequisites

- A working WordPress installation (6.0+)
- Administrator access to the WordPress site

### For the plugin

- PHP 8.2+

### For the CLI

- Node.js 18+
- The [Code Snippets](https://wordpress.org/plugins/code-snippets/) plugin active on your WordPress site
- A WordPress [Application Password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/)

## First steps

### 1. Install the plugin

Download and activate the Loopress plugin from the WordPress admin (**Plugins → Add New → Upload Plugin**).

After activation, a **Loopress** entry appears in the admin sidebar. From there you can search and install Composer packages without touching the server.

### 2. Install and configure the CLI

```bash
npm install -g @loopress/cli
lps site config
```

Enter your WordPress URL, username and application password when prompted.

### 3. Run your first snippet sync

```bash
# Download your existing snippets as .php files
lps snippets pull

# Edit locally, commit to Git, then deploy back
lps snippets push
```
