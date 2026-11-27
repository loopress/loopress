---
title: A Lockfile for WordPress Plugins, So Staging and Production Run the Same Versions
description: Pin exact WordPress.org plugin versions in loopress.json, install the same set on every environment without SSH, and turn every plugin update into a pull request you review.
date: 2026-12-01
draft: true
cliVersion: 0.37.0
wordpressPluginVersion: 2026.21.0
authors:
  - maxime
tags:
  - plugins
  - composer
  - reproducibility
  - wordpress
excerpt: Your JavaScript project has a lockfile. Your WordPress site has whatever versions each environment happened to auto-update to. Here's how to pin plugins like dependencies, review every update as a pull request, and why downgrades are refused by default.
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

It lists the plugins installed on production and asks which ones the project should track. Leave out the ones that only belong on that environment, a cache or a backup plugin for example. Every plugin you tick is pinned to the version running there right now. It's the fastest way to turn "what production happens to run" into a spec.

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

## An update is a one-line diff

Once versions are pinned, updating a plugin stops being a button on a live site and becomes a change in your repo:

```bash
lps plugin outdated
```

```text
PLUGIN       CURRENT  LATEST  JUMP
woocommerce  9.4.2    9.5.1   minor
akismet      5.3.3    5.3.3   -
```

`lps plugin update` rewrites the pins in `loopress.json` (`--minor` or `--patch` to stay within a range), and nothing touches a site until you push:

```diff title="loopress.json"
-    "woocommerce": "9.4.2",
+    "woocommerce": "9.5.1",
```

You can push that to staging, look at it for a day, then push the same file to production.

The step after that is to stop running the command yourself. A [weekly CI workflow](/ci/plugin-update-prs/) runs `lps plugin update`, installs the new versions on a throwaway WordPress inside the job, runs `lps plugin audit`, and opens a pull request with a before/after table. A version that fails to install fails the job, so no pull request is opened for it. No real site is touched, and no token is needed. What the job checks is that the new versions install and activate. It doesn't check that your checkout still works: that part is still yours, on staging.

## Why a downgrade needs `--force`

Now the other direction. The plan above would actually be refused: going from 9.5.0 back to 9.4.2 is a downgrade, and `lps plugin push` won't do one unless you pass `--force`.

The reason is the database. When WooCommerce 9.5.0 first ran on that site, it may have migrated tables, added columns, rewritten options. Putting the 9.4.2 files back doesn't undo any of that, it just runs old code against a schema it's never seen. Sometimes that's fine. Sometimes it's the start of a very long afternoon. A downgrade is a decision, so Loopress makes you state it.

The same caution applies to a plugin that was installed by hand, by uploading a zip or through the admin. Composer can't cleanly install over a folder it doesn't manage, so Loopress refuses to take it over without `--force`, which replaces its files with the WPackagist build.

## Removing a line uninstalls the plugin

The lockfile is declarative in both directions. Delete `contact-form-7` from `loopress.json`, push, and Loopress uninstalls it. The plan lists it under "To uninstall", and in a terminal you're asked to confirm. In CI, with nobody to ask, the push goes ahead, so the review happens where it should: a careless edit to `loopress.json` shows up in the pull request as what it is, an uninstall.

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

And for known vulnerabilities in the versions you've pinned:

```bash
lps plugin audit
```

It checks every pinned plugin against [wpvulnerability.net](https://www.wpvulnerability.net/) and the WordPress.org API (closed plugins, PHP requirements, no update in over two years), and exits non-zero when a known vulnerability affects a pinned version. Pinning versions only makes sense if you also find out when a pinned version turns into a liability.

## What it doesn't do

- **Premium plugins.** ACF Pro, Gravity Forms and the like aren't on WordPress.org, so they aren't on WPackagist, and Loopress can't install or version them. `plugin pull` still offers them in its list: leave them unticked. And be careful with `--prune`, which deactivates every active plugin missing from `loopress.json`, premium ones included.
- **Database rollbacks.** A downgrade replaces files, never data. [`lps plugin rollback`](/plugins/#lps-plugin-rollback) puts the previous versions back, with the same limit.
- **Multisite.** Plugin pinning isn't supported on multisite networks yet.

---

```bash
npm install -g @loopress/cli
```

Plugin pinning is a [Loopress Full](/wordpress-plugin/) feature. The [Plugins reference](/plugins/) covers every flag, and how it defers to your own `composer.json` if your project has one.
