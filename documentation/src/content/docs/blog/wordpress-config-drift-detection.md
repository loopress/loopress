---
title: A Client Changed a Field Group in wp-admin. See It, Keep It or Undo It
description: WordPress configuration changes through admin screens nobody reviews. lps diff compares your Git repo with a live site, push stops before overwriting an edit made outside it, and a nightly CI job tells you before the client does.
date: 2026-12-15
draft: true
cliVersion: 0.37.0
wordpressPluginVersion: 2026.21.0
authors:
  - maxime
tags:
  - drift
  - ci
  - workflow
  - wordpress
excerpt: Your repo says one thing, production says another, and today the only way to find out is to click through wp-admin. Here's how to see the difference in one command, decide what to keep, and get warned the night it happens.
---

Monday morning, a client writes: "the delivery date isn't showing on the product page anymore". You open the site. Someone renamed a field in the ACF field group on Friday, from wp-admin, and the template still reads the old name.

Git tells you exactly what changed in your theme last Friday. It tells you nothing about that field, the SEO title template someone edited in Yoast, or the menu item that exists on staging and nowhere else.

That gap has a name: drift. The configuration your repository describes and the configuration the site actually runs slowly stop matching, one admin screen at a time. Nobody does anything wrong. WordPress is designed to be changed from the browser, and every one of those changes bypasses your Git history.

You can't prevent all of it, and you shouldn't try: clients and editors need their admin screens. What you can do is see it, and decide.

## See it

```bash
lps diff --env production
```

This reads every resource Loopress tracks from the site (ACF field groups, menus, options, snippets, forms, API routes, hooks, pages, theme styles, Composer and more) and compares each one with your local files. Resources that match print `in sync`. The others list each item that differs:

```text
Comparing production → local files

Snippets  in sync
ACF
  ~ group_product_delivery
Options
  ~ wpseo_titles

Drift detected.
```

Narrow it when you only care about part of the site:

```bash
lps diff --only acf --only option
lps diff --skip composer
```

Each resource also has its own command (`lps acf diff`, `lps menu diff`...) if you'd rather not type flags.

## Keep it, or undo it

Once you can see the change, there are three honest answers, and the diff tells you which one applies.

**The site is right, the repo is stale.** The client's rename was on purpose. Pull it, fix the template, commit both:

```bash
lps acf pull --env production
```

The change is now in Git, reviewed after the fact instead of never.

**The repo is right, the site is wrong.** Push your version back:

```bash
lps acf push --env production
```

Loopress doesn't let you do that by accident. Before writing, a push compares the site with the state your machine saw at its last pull or push. If something was changed there since and the push would overwrite it, the push stops and names it:

```text
Changed on https://shop.example.com outside Loopress since this machine last pulled or pushed (2026-11-28T16:42:10.000Z), this push would overwrite: group_product_delivery.
```

In a terminal it asks you instead. In a script it stops, and `--overwrite` is how you say "yes, replace it". `--yes` doesn't imply it.

The guard has two limits. It needs that last pull or push: on a machine that has never done either for this site, there is nothing to compare with, so run `lps diff --only acf` before that first push. And it covers objects the site still has: a field group deleted in wp-admin is recreated by the push, without a warning. If a deletion on the site was intended, check `lps diff --only acf` before pushing.

**Both are partly right.** Pull, resolve the difference in Git like any other conflict, push.

## Compare two sites with each other

Before a release, the question is usually not "does production match my repo?" but "what's on staging that isn't on production yet?":

```bash
lps diff --env staging --against production
```

No local files involved. Both sides are read live, so the answer is still right if your checkout is three weeks behind.

## The exit code is the feature

`lps diff` exits with:

- `0` when everything is in sync,
- `1` when it finds drift,
- `2` when a resource couldn't be compared at all (the site was unreachable, a plugin the resource depends on is missing).

That last one matters. A drift check that silently reports "in sync" because it couldn't reach half the resources is worse than no check. An inconclusive run fails differently from a drifted one, so your pipeline can treat them differently.

Plugins and themes are versioned in `loopress.json` rather than as files, and have their own equivalent: `lps plugin status` and `lps theme status` also exit non-zero on drift.

## Find out the night it happens

Put those exit codes on a schedule and you get an alarm instead of a Monday-morning email. A GitHub Actions workflow that runs every night against production:

```yaml
name: Drift check

on:
  schedule:
    - cron: "0 6 * * *"
  workflow_dispatch:

jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm install -g @loopress/cli
      - name: Restore site credentials
        env:
          LOOPRESS_CONFIG: ${{ secrets.LOOPRESS_CONFIG }}
        run: |
          mkdir -p ~/.config/loopress
          printf '%s' "$LOOPRESS_CONFIG" > ~/.config/loopress/config.json
      - run: lps diff --env production
      - run: lps plugin status --env production
```

The credentials come from a secret holding the output of `lps project export --env production` (`cfg=$(lps project export --env production) && gh secret set LOOPRESS_CONFIG --body "$cfg"`), the same setup as [deploying from CI](/ci/#deploying-to-a-real-environment). `lps diff` never writes anything, so the check itself can't break the site. The [drift detection guide](/ci/drift-detection/) adds a webhook, to get the alert in Slack or Discord with the report attached.

For machine consumption, every variant takes `--json` and returns `{drift, left, right, resources}`, one entry per resource with its `added`, `changed`, and `removed` items.

## What it doesn't do

- **It doesn't tell you who.** The diff shows what changed, not which user changed it. For that, WordPress needs an activity log plugin.
- **It compares with the last state this machine saw.** The push guard protects the machine that pulled or pushed last. A teammate's machine, or a fresh CI checkout, hasn't seen that state: run `lps diff` before pushing from there.
- **Content isn't part of it.** Posts, orders and users are never pushed, so they never drift in this sense.

---

```bash
npm install -g @loopress/cli
```

The [CLI overview](/cli/) lists every resource `lps diff` covers. Composer, API routes, hooks, forms, snippets, and static pages need [Loopress Full](/wordpress-plugin/); ACF, menus, and options work with Light too.
