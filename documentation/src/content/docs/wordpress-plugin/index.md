---
title: WordPress Plugin
description: Manage Composer dependencies from your WordPress admin panel.
---

The Loopress WordPress Plugin adds a dedicated admin page to your WordPress installation that lets you manage PHP packages through [Composer](https://getcomposer.org/), without needing SSH or command-line access to your server.

## What it does

- **Dependency management**: search, install and remove Composer packages from [Packagist](https://packagist.org/)

## How it works

The plugin registers a **Loopress** entry in the WordPress admin sidebar. It stores your project's Composer dependencies in `wp-content/lps/`, separate from the plugin itself, so they survive plugin updates.

A REST API under `lps/v1` powers the React admin UI. All endpoints require the `manage_options` capability (administrator role).

## Requirements

- WordPress 6.0+
- PHP 8.2+
- Composer available on the server (bundled via the plugin's own `vendor/` directory)
- `manage_options` capability (administrator role)

## Installation

1. Download the latest `loopress.zip` from the [GitHub releases](https://github.com/loopress/releases)
2. In your WordPress admin, go to **Plugins → Add New → Upload Plugin**
3. Upload and activate the plugin
4. Navigate to **Loopress** in the sidebar

## Pages

- [Dependency Management](/wordpress-plugin/dependencies/)
- [Using packages in code snippets](/wordpress-plugin/code-snippets/)
