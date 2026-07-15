---
title: Dependency Management
description: Search, install and remove Composer packages from the WordPress admin panel.
---

:::note
This feature is provided by [Loopress Full](/wordpress-plugin/), the full edition of the plugin, not by Loopress Light (the edition distributed on WordPress.org).
:::

The **Dependency Management** card lets you browse [Packagist](https://packagist.org/) and install PHP packages directly from your WordPress admin, without SSH access.

## Where packages are stored

Loopress Full maintains its own `composer.json` under `wp-content/loopress/`. Installed packages land in `wp-content/loopress/vendor/`. This location is separate from the plugin itself so packages survive plugin updates and can be used anywhere on the site via the Composer autoloader.

```
wp-content/
  loopress/
    composer.json        ← managed by Loopress Full
    vendor/
      autoload.php       ← require this in your snippets
      guzzlehttp/guzzle/
      ...
```

## Installing a package

1. Type the package name or a keyword in the **Search a Composer package** field (minimum 2 characters)
2. Select the package from the dropdown
3. Choose a version (compatible versions are pre-selected automatically based on your PHP version)
4. Click **Install**

Version compatibility indicators:

| Icon | Meaning |
|------|---------|
| 🟢 | Compatible with your PHP version |
| 🔴 | Requires a different PHP version |
| ❓ | No PHP constraint declared |

## Removing a package

In the **Installed Packages** card, click **Remove** next to the package you want to uninstall.

## Updating a package

The **Installed Packages** card checks each installed package against Packagist. If a newer version is available, an "update: x.y.z" badge appears next to the current version, and an **Update** button runs `composer require` to install the latest version in place.

## Repair

The **Repair** action runs `composer update` against `wp-content/loopress/composer.json`. Use it when:

- The autoloader is missing after a server migration
- The lockfile has drifted from `composer.json`
- A previous install left the dependencies in an inconsistent state

The autoload error banner at the top of the page appears automatically when Loopress Full detects a missing or broken autoloader and prompts you to run Repair.

## REST API

Outdated packages are exposed at `GET /wp-json/loopress/v1/composer/outdated`:

```json
[
  {
    "name": "some/package",
    "version": "1.2.0",
    "latest": "1.4.2"
  }
]
```

## Notes

- Composer is executed in-process (via the `composer/composer` library). Long-running installs extend the PHP execution time limit to 5 minutes automatically.
- Only stable versions are shown in the version picker (no `dev-*` releases).
