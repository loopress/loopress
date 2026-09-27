---
title: A Lockfile for WordPress Plugins, So Staging and Production Run the Same Versions
description: Knowing WooCommerce is installed isn't a spec. Pin exact WordPress.org plugin versions in loopress.json and Loopress installs the identical set on every environment through Composer and WPackagist, without SSH.
date: 2026-11-19
draft: true
cliVersion: 0.26.0
wordpressPluginVersion: 2026.11.0
authors:
  - maxime
tags:
  - plugins
  - composer
  - reproducibility
  - wordpress
excerpt: Your JavaScript project has a lockfile. Your WordPress site has whatever versions each environment happened to auto-update to. Here's how to pin plugins like dependencies, and why downgrades are refused by default.
---

A bug shows up on production and not on staging. Twenty minutes later you find out why: production auto-updated WooCommerce last night, staging didn't. Same plugins, different versions, different behaviour.

Every other ecosystem solved this years ago with a lockfile. `package-lock.json`, `composer.lock`, `Gemfile.lock`: the exact versions a project runs are written down, committed, and installed identically everywhere. WordPress plugins mostly get managed by clicking "Update" on whichever site you happen to be logged into.

## Write the versions down

With [Loopress Full](/wordpress-plugin/), plugins are declared in your project's `loopress.json`:

```json title="loopress.json"
{
  "plugins": {
    "woocommerce": "9.4.2",
    "wordpress-seo": "latest"
  }
}
```

Keys are WordPress.org slugs. A value is either an exact version, installed as-is on every push, or `latest`, re-resolved each time. You don't have to type the file by hand:

```bash
lps plugin pull --env production
```

That writes every plugin installed on production into `loopress.json`, each pinned to the version running there right now. It's the fastest way to turn "what production happens to run" into a spec.

## Install the same set everywhere

```bash
lps plugin push --env staging
```

Loopress installs the manifest by running Composer with the [WPackagist](https://wpackagist.org/) repository *on the site*, through the Loopress plugin. No SSH, no `composer.json` in your repo, no `vendor/` in Git. Before touching anything, it prints the plan:

```text
Pushing plugins to https://staging.example.com

To install (1):
  + contact-form-7 6.0.5
To re-pin (1):
  ~ woocommerce 9.5.0 to 9.4.2
```

Push the same `loopress.json` to production and it lands on the same versions. That's the whole point of exact pins. `latest` is there for plugins you genuinely want to float, but it's not reproducible: two environments pushed a day apart can resolve to two different versions.

## Why that re-pin needs `--force`

The plan above would actually be refused. Going from 9.5.0 back to 9.4.2 is a downgrade, and `lps plugin push` won't do one unless you pass `--force`.

The reason is the database. When WooCommerce 9.5.0 first ran on that site, it may have migrated tables, added columns, rewritten options. Putting the 9.4.2 files back doesn't undo any of that, it just runs old code against a schema it's never seen. Sometimes that's fine. Sometimes it's the start of a very long afternoon. A downgrade is a decision, so Loopress makes you state it.

The same caution applies to a plugin that was installed by hand, by uploading a zip or through the admin. Composer can't cleanly install over a folder it doesn't manage, so Loopress refuses to take it over without `--force`, which replaces its files.

## Removing a line uninstalls the plugin

The lockfile is declarative in both directions. Delete `contact-form-7` from `loopress.json`, push, and it's uninstalled. The plan shows it, and you're asked to confirm. There's no separate "remove" step to forget, which also means a careless edit to `loopress.json` shows up in code review as what it is: an uninstall.

## Check drift in CI

```bash
lps plugin status --env production
```

```text
Not installed: contact-form-7
Version drift: woocommerce is 9.5.0, loopress.json pins 9.4.2
Active but untracked: hello-dolly
```

It exits non-zero on drift, so it drops straight into a scheduled CI job: the day someone clicks "Update" on production, the job goes red and tells you which plugin moved.

For the other direction, known vulnerabilities in the versions you've pinned:

```bash
lps plugin audit
```

It checks every pinned plugin against [wpvulnerability.net](https://www.wpvulnerability.net/) and the WordPress.org API (removed from the directory, PHP requirements, abandonment), and exits non-zero when a known vulnerability affects a pinned version. Pinning versions only makes sense if you also find out when a pinned version turns into a liability.

## What it doesn't do

- **Premium plugins.** ACF Pro, Gravity Forms, and friends aren't on WordPress.org, so they aren't on WPackagist, and Loopress can't install or version them. `plugin pull` will still list them in `loopress.json`: delete those lines. And be careful with `--prune`, which deactivates every active plugin missing from `loopress.json`, premium ones included.
- **Database rollbacks.** A downgrade replaces files, never data.
- **Multisite.** Plugin pinning isn't supported on multisite networks yet.

---

```bash
npm install -g @loopress/cli
```

Plugin pinning is a [Loopress Full](/wordpress-plugin/) feature. The [Plugins reference](/plugins/) covers every flag, and how it defers to your own `composer.json` if your project has one.
