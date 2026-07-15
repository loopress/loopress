---
title: Platform Diagnostics
description: Detect and fix PHP version mismatches before they cause Composer install failures.
---

:::note
This feature is provided by the [Loopress Plus edition](/wordpress-plugin/) of the plugin, not the free edition distributed on wordpress.org.
:::

The **Platform Diagnostics** banner appears automatically at the top of the **Loopress → Dependencies** page when an issue is detected. It helps you catch PHP version mismatches before they cause packages to be installed for the wrong runtime.

## What it checks

### `config.platform.php` missing

Composer uses the `config.platform.php` value in `composer.json` to decide which packages are compatible with your server. If this value is absent, Composer does not enforce PHP version constraints and may install packages that are incompatible with your actual PHP version.

**Detected issue code:** `platform_php_missing`

### `config.platform.php` mismatch

The platform PHP version in `wp-content/loopress/composer.json` does not match the PHP version the server is actually running. This can happen after a PHP upgrade.

**Detected issue code:** `platform_php_mismatch`

**Example message:**

> `config.platform.php` is 8.1 but the server is running PHP 8.2. Packages may be installed for the wrong PHP version.

## Fixing a detected issue

Click the **Set to PHP x.x.x** button in the banner. This updates `config.platform.php` in `wp-content/loopress/composer.json` to match the currently running PHP version.

## REST API

The diagnostics data is exposed at `GET /wp-json/loopress/v1/composer/diagnostics`:

```json
{
  "php_version": "8.2.29",
  "platform_php": "8.1.0",
  "issues": [
    {
      "code": "platform_php_mismatch",
      "message": "config.platform.php is 8.1.0 but the server is running PHP 8.2.29..."
    }
  ]
}
```

The fix endpoint is `POST /wp-json/loopress/v1/composer/fix-platform`.
