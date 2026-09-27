---
title: What Changed on Production Last Tuesday? Catching WordPress Config Drift
description: WordPress configuration changes through admin screens nobody reviews. lps diff compares your Git repo with a live site, or two sites with each other, and exits non-zero on drift, so a scheduled CI job can tell you before a client does.
date: 2026-10-08
draft: true
cliVersion: 0.26.0
wordpressPluginVersion: 2026.11.0
authors:
  - maxime
tags:
  - drift
  - ci
  - workflow
  - wordpress
excerpt: Your repo says one thing, production says another, and the only way to find out today is to click through wp-admin. lps diff turns that into one command with a CI-friendly exit code.
---

Git tells you exactly what changed in your theme last Tuesday. It tells you nothing about the SEO title template someone edited in Yoast, the snippet a colleague "just tweaked" in production, or the ACF field that exists on staging and nowhere else.

That gap has a name: drift. The configuration your repository describes and the configuration the site actually runs slowly stop matching, one admin screen at a time. Nobody does anything wrong. WordPress is designed to be changed from the browser, and every one of those changes bypasses your Git history.

You can't prevent all of it, and you shouldn't try: editors need their admin screens. What you can do is see it.

## Compare the repo with a site

```bash
lps diff --env production
```

This reads every resource Loopress tracks from the site, snippets, forms, ACF objects, API routes, hooks, static pages, SEO settings, options, menus, theme styles, and Composer, and compares each one with your local files. Resources that match print `in sync`. The others list each item that differs, with a patch for modified ones:

```text
Comparing production → local

Snippets  in sync
SEO
  ~ settings
    ...
ACF
  + group_event_details
```

The run ends with a tally and a verdict: `Everything is in sync.` or `Drift detected.`

Narrow it when you only care about part of the site:

```bash
lps diff --only acf --only seo
lps diff --skip composer
```

Each resource also has its own command (`lps acf diff`, `lps menu diff`...) if you'd rather not type flags.

## Compare two sites with each other

The question before a release is usually not "does production match my repo?" but "what's on staging that isn't on production yet?":

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

## A nightly drift check

Put those exit codes on a schedule and you get an alarm instead of a surprise. A GitHub Actions workflow that runs every night against production:

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
      - run: npm install -g @loopress/cli
      - name: Restore Loopress project config
        run: |
          mkdir -p ~/.config/loopress
          echo "$LOOPRESS_CONFIG" > ~/.config/loopress/config.json
        env:
          LOOPRESS_CONFIG: ${{ secrets.LOOPRESS_CONFIG }}
      - run: lps diff --env production
      - run: lps plugin status --env production
```

The credentials come from a secret holding your `config.json`, the same setup as [deploying from CI](/ci/#deploying-to-a-real-environment). `lps diff` never writes anything, so the check itself can't break the site.

When it goes red, you have three honest options, and the diff tells you which one applies:

1. **The site is right, the repo is stale.** Someone made a legitimate change in wp-admin. Pull it (`lps seo pull`, `lps acf pull`...), commit it, and it's reviewed after the fact instead of never.
2. **The repo is right, the site is wrong.** Someone changed something they shouldn't have. Push the repo's version back.
3. **Both are partly right.** Pull, resolve the difference in Git like any other conflict, push.

## Diff before you deploy, too

The same command answers the question every deploy should start with:

```bash
lps diff --env production   # what am I about to overwrite?
lps push --env production --yes
```

If the diff shows a change you didn't make, stop and find out who did. Pushing over it is how a client's Monday-morning edit disappears.

For machine consumption, every variant takes `--json` and returns `{drift, left, right, resources}`, one entry per resource with its `added`, `changed`, and `removed` items.

---

```bash
npm install -g @loopress/cli
```

The [CLI overview](/cli/) lists every resource `lps diff` covers. Composer, API routes, hooks, forms, snippets, and static pages need [Loopress Full](/wordpress-plugin/); ACF, SEO, menus, and options work with Light too.
