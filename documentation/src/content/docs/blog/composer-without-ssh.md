---
title: Installing Composer Packages in WordPress Without SSH
description: The standard workflow for adding a PHP dependency to WordPress involves SSH, a terminal on the server, and a lot of hope. There's a better way.
date: 2026-06-09
draft: true
authors:
  - maxime
tags:
  - composer
  - php
  - wordpress
  - dependencies
excerpt: Need to pull in a Packagist package on a WordPress site? The usual path is SSH into the server, install Composer, run composer require, and pray. The Loopress plugin does this from the admin panel.
---

You need to add a PHP dependency to a WordPress site. Maybe a PDF generation library, a CSV parser, an image manipulation package. Something available on Packagist.

Here's what the standard workflow looks like.

## The current workflow

**If you're on managed hosting (most clients are):**

1. Check if SSH is available (often it isn't, or it requires upgrading the hosting plan)
2. If SSH is available: connect, check if Composer is installed, install it if not
3. Navigate to the WordPress root
4. Initialize `composer.json` if it doesn't exist
5. Run `composer require vendor/package`
6. Hope the server's PHP version matches your local environment
7. Hope the `vendor/` directory ends up in the right place
8. Repeat for every site, every environment

This is assuming nothing goes wrong. In practice, you'll hit permission issues, PHP version mismatches, or a host that simply blocks Composer from running.

**The workaround people actually use:**

Run Composer locally, then upload the `vendor/` directory to the server via FTP or rsync. This works but means you're manually syncing binary files, and the next developer who needs to add a dependency starts from scratch figuring out where everything lives.

Neither option is good.

## What Loopress does differently

The Loopress plugin adds a **Dependency Management** panel to your WordPress admin. It talks to Packagist, runs Composer server-side through a sandboxed process, and handles the install without you needing a terminal or SSH access.

### Installing a package

Navigate to **WordPress Admin → Loopress → Dependencies**.

Search for a package by name (`tecnickcom/tcpdf`, `league/csv`, whatever you need). Loopress queries Packagist directly and shows you available versions.

Select the version, click **Install**. Loopress runs `composer require` on the server and installs the package into a managed `vendor/` directory inside the plugin's scope.

The installed packages are then available to your code snippets via autoloading:

```php
use TCPDF;

$pdf = new TCPDF();
```

### Why this matters for agencies

If you manage multiple client sites, the usual Composer workflow means either:
- Maintaining SSH access to every server
- Teaching clients how to run terminal commands (not happening)
- Keeping a pile of FTP credentials and manually uploading `vendor/` directories

With Loopress, the dependency management surface moves into the WordPress admin. You can install, update, and remove packages from the same interface you use to manage everything else. No server access required.

### Seeing what's installed

The **Dependencies** panel shows:
- All installed packages with their current versions
- Available updates from Packagist
- A one-click update path

This is the equivalent of `composer show` and `composer outdated`, surfaced in the UI.

## What Loopress doesn't replace

Loopress's dependency management is designed for adding libraries to a running WordPress site, pulling in packages that your snippets or custom code need. It's not a replacement for a full Bedrock/Composer setup where WordPress itself is a Composer dependency.

If you're building on [Roots/Bedrock](https://roots.io/bedrock/), you already have a proper Composer workflow and probably don't need this. Loopress fills the gap for the other 90% of WordPress sites that aren't running a full stack framework: sites on shared hosting, client sites where the server environment is opaque, or projects where "set up Bedrock" isn't a conversation you can have.

---

The Loopress plugin is available on [GitHub](https://github.com/loopress). Installation is a standard WordPress plugin install, no server configuration required.
