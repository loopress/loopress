---
title: Your Block Theme's Global Styles Aren't in theme.json, and That's a Problem
description: Colors and fonts picked in the Site Editor's Styles screen live in the database, not in your theme's theme.json. Loopress pulls them into a JSON file you can review, diff, and push to every environment.
date: 2026-10-29
draft: true
cliVersion: 0.26.0
wordpressPluginVersion: 2026.11.0
authors:
  - maxime
tags:
  - block themes
  - full site editing
  - theme.json
  - wordpress
excerpt: You version your block theme's theme.json in Git. Then a designer changes the brand color in Site Editor > Styles, and that change goes into a database row your repo never sees. Here's how to bring it back into Git.
---

Block themes made WordPress styling feel like code again. Colors, fonts, spacing scales: all declared in a `theme.json` file that sits in your theme's repository, reviewed and deployed like everything else.

Then someone opens **Appearance > Editor > Styles**, nudges the primary color, swaps the heading font, and saves.

That change did not touch `theme.json`. It went into the database.

## Two layers, one of them invisible

WordPress resolves a block theme's styles from several layers stacked on top of each other: core defaults, then the theme's `theme.json`, then the user's customizations. That last layer is what the Styles screen writes, and it's stored in a `wp_global_styles` post, one per theme.

The user layer wins. So the site's real colors are "whatever `theme.json` says, except where the database says otherwise", and only half of that sentence is in Git.

The consequences show up where you'd expect:

- Staging and production drift apart, because each got its own round of tweaks in the Styles screen.
- A fresh environment built from the repo looks *wrong*, because it has the theme's defaults and none of the customizations.
- The brand color changed last month and nobody can say who changed it or from what.

## Pull the user layer into a file

```bash
lps theme-styles pull
```

This reads the active theme's Global Styles through WordPress core's own REST API and writes them as one file, named after the theme:

```text
theme/
  twentytwentyfive-global-styles.json
```

The file holds `settings` and `styles`, the same two keys you already know from `theme.json`. It contains only what was customized, not the whole resolved stylesheet, so a small change in the Styles screen is a small diff. WordPress bookkeeping (the post id, REST links) is left out, which keeps the file identical across environments.

Commit it. The next time someone changes the brand color, `lps theme-styles pull` followed by `git diff` shows you exactly which value moved.

## Push it everywhere

```bash
lps theme-styles diff --env production   # what production's Styles screen has vs. the file
lps theme-styles push --env production --yes
```

Now staging and production share one set of customizations, and a new environment gets them on its first push instead of from someone's memory. `lps theme-styles rollback` restores the previous state if a push goes wrong, and the global `lps diff` includes theme styles, so a nightly drift check catches the next unreviewed tweak.

## Or promote them into theme.json

Once the customizations are in a file, you have a choice most teams never get: leave them as a user layer, or move them into the theme itself. The keys match, so a value that has stabilized can be copied into `theme.json`, committed with the theme, and removed from the user layer. The Styles screen stays a place to experiment; the theme stays the source of truth.

## Where it stops

- **Block themes only.** A classic theme has no Styles screen and no `wp_global_styles` post, so the commands fail with an explicit error instead of syncing nothing.
- **The active theme only.** Switch themes on the site and pull again, and you get a second file for the new theme. The first one is never deleted.
- **One style set.** Named style variations (WordPress 6.6 and later) aren't synced yet, only the active set.
- **Opt-in, not automatic.** The aggregate `lps push` and `lps pull`, and therefore `lps promote`, leave theme styles out, so a site on a classic theme doesn't break every routine sync. Run `lps theme-styles push` and `pull` explicitly.

---

```bash
npm install -g @loopress/cli
```

Theme styles sync talks to WordPress core's REST API directly, so it works with Loopress Light and Loopress Full alike. The [Theme Styles reference](/theme-styles/) has every flag.
