---
title: Shipping a WordPress Plugin Security Update Without Overwriting Production
description: A plugin pin with a known vulnerability, a pull request tested on a throwaway WordPress, staging, then production, where the push stops on the hours a client changed in wp-admin that morning instead of erasing them.
date: 2026-12-10
draft: true
cliVersion: 0.32.2
wordpressPluginVersion: 2026.17.1
authors:
  - maxime
tags:
  - plugins
  - deployment
  - workflow
  - ci
excerpt: Maintaining a client's WordPress site means two things happen in the same week. You ship a plugin security update, and the client edits something in wp-admin. Here is the whole path from audit to production, and the moment the deploy refuses to erase the client's change.
---

If you maintain WordPress sites for clients, you know this week. A plugin you pinned has a known vulnerability, so you need to ship the fix. And on the same production site, the client logged into wp-admin and changed something, because it's their site.

The usual deploy handles the first and quietly erases the second. This post walks through the whole path with Loopress, on the same demo site as the video: [Tanneurs Bakery](https://github.com/loopress/demo-bakery).

## 1. Find the vulnerable pin

The site's plugins are pinned in `loopress.json`, like a lockfile. `lps plugin audit` checks every pin against [wpvulnerability.net](https://www.wpvulnerability.net) and flags plugins that look abandoned on WordPress.org:

```bash
lps plugin audit
```

Here it flags ACF 6.8.1, fixed upstream in 6.8.2. Pin the latest release:

```bash
lps plugin add advanced-custom-fields --version 6.8.10
git diff loopress.json
lps plugin audit   # clean
```

`--version` takes an exact version, not a Composer range: staging and production will run the identical release. See [A lockfile for WordPress plugins](/blog/wordpress-plugin-versions-lockfile/).

## 2. Let CI test it on a throwaway WordPress

The repo has one workflow, run on every pull request:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # A throwaway WordPress on the runner, with the Loopress CLI configured for it.
      - uses: loopress/setup-ci@main
      - run: lps push --yes
      # Fails on a known vulnerability in a pinned plugin version.
      - run: lps plugin audit
      # Exits 1 if anything pushed above did not land: the site now matches Git.
      - run: lps diff
```

The whole site, plugins, field groups, hooks, options, pages, is pushed to a WordPress that exists for two minutes. If the new ACF release breaks a field group or a hook, the pull request goes red before any real site sees it. `lps plugin audit` and `lps diff` both exit non-zero on a problem, so they work as CI gates without extra glue. See [CI](/ci/).

## 3. Staging

From the pull request branch:

```bash
lps push --env staging
```

Click around, show the client if needed.

## 4. Production, and the client's edit

Meanwhile, the bakery owner changed the Sunday hours for the holidays, in wp-admin, on production. Their settings page writes the `bakery_info` option, the same option the repo tracks in `options/bakery_info.json`.

```bash
lps push --env production
```

Plugins go first, so ACF is re-pinned to 6.8.10. Then the options step compares production with what the last push from this machine wrote, finds `bakery_info` changed since, and stops:

```
Changed on https://bakery.loopress.dev outside Loopress since your last push (…), this push would overwrite: bakery_info.
? Overwrite those changes? (y/N)
```

The default is No. In CI, with no terminal to ask, it fails instead.

## 5. Bring their edit into Git

```bash
lps diff --only option --env production
lps option pull --env production
git diff options/
lps push --env production
```

The owner's hours are now in the repo, reviewed like any change, and the push goes through. Commit it to the pull request and merge.

## What this does not cover yet

Be precise about where the guarantee holds. The check compares production with the snapshot of the last push **from the same machine**. A production deploy run from CI starts on a fresh runner with no snapshot, so it isn't checked. Today, deploy production from the laptop that pushed it last, and keep CI for testing. Closing that gap is on our list.

Also: plugins have no rollback. Going back means reverting the pin and pushing again, and a downgrade doesn't undo a plugin's database migrations. That's why the update goes through a throwaway WordPress and staging first.

## Try it

```bash
npm install -g @loopress/cli
lps init
lps plugin audit
```

The demo repo, with its CI workflow, is [loopress/demo-bakery](https://github.com/loopress/demo-bakery).
