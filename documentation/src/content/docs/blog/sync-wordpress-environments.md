---
title: Syncing WordPress Configuration Between Environments Without a Database Dump
description: Moving a menu or a plugin setting from staging to production shouldn't mean overwriting production's database. Loopress copies configuration between environments as files, and leaves the content alone.
date: 2026-12-03
draft: true
cliVersion: 0.26.0
wordpressPluginVersion: 2026.11.0
authors:
  - maxime
tags:
  - environments
  - workflow
  - staging
  - wordpress
excerpt: The standard answer for syncing WordPress between environments is "sync the database". That's a nuclear option for what should be a surgical change. Here's how to move configuration from staging to production and nothing else.
---

You spent the afternoon on staging: a new ACF field group for case studies, a reworked footer menu, an updated SEO title template, two new snippets. Now all of it has to reach production.

The standard answer is to sync the database. Every staging tool and every host's "push to live" button does some version of it, and it overwrites production's content with staging's: every order, comment, and form entry since the last sync, gone. For a handful of settings, that's a nuclear option.

The alternative is to redo everything by hand on production, and hope you click the same things in the same order.

## Configuration isn't content

The reason database syncs are so blunt is that WordPress keeps two very different things in the same tables. **Content** is what the site's users and editors produce: posts, orders, comments, form entries. It's born on production and belongs there. **Configuration** is what you build: field groups, menus, snippets, SEO templates, plugin settings, routes. It's born on staging (or your laptop) and needs to travel.

A database sync can't tell them apart. Loopress only ever handles the second kind, as files.

## First, see the difference

Before moving anything, ask what's actually different:

```bash
lps diff --env staging --against production
```

Both environments are read live and compared resource by resource: snippets, ACF objects, API routes, hooks, forms, SEO settings, options, menus, static pages, theme styles, Composer dependencies. You get the list of what exists on one side and not the other, and a patch for everything that changed. If there's something on production you *don't* recognize, now is the time to find out, not after overwriting it.

## Then promote

```bash
lps promote staging production
```

`promote` runs `lps pull` from staging, then `lps push` to production, in one step. It asks for confirmation once, up front, and calls out production by name in that prompt. In CI, pass `--yes`. `--dry-run` previews the real thing: it pulls staging into a throwaway copy of your project and dry-runs the push from there, so your own files and production stay untouched.

Two behaviours make it safe to use without thinking too hard:

- **A failed pull stops everything.** If staging can't be read completely, production isn't touched. A half-pulled configuration is never pushed onward.
- **Every push is snapshotted.** Each resource push saves what it replaced, so `lps acf rollback --env production` (or `menu`, `seo`, `snippet`...) undoes that resource if the promotion was a mistake.

## What it carries, and what it doesn't

`promote` moves everything the aggregate `lps pull` and `lps push` handle: WordPress.org plugins (pinned in `loopress.json`), Composer dependencies, ACF, API routes, hooks, forms, SEO, menus, tracked options, and snippets. A few things behave differently, and they're worth knowing before your first promotion:

- **Your local files are overwritten with staging's state.** That's how the pull half works. Commit or stash your work first, then look at `git diff` after the promotion: it's a precise record of what just moved to production.
- **Static pages come from your files, not from staging.** Pages have no `pull` (the file is the source of truth), so the push half sends whatever is in your `pages/` directory.
- **Theme styles are opt-in.** They're left out of the aggregate commands so a classic-theme site doesn't break every sync. Run `lps theme style pull --env staging` and `lps theme style push --env production` explicitly.
- **Menus need their targets.** A menu item pointing at a page that doesn't exist on production fails that menu rather than guessing. Create the page first.
- **Ids don't travel.** A tracked option whose value embeds a post or user id means something else on production. Mark it `readonly` or leave it out.

## Surgical, when you need it

`promote` is all-or-nothing by design. When only one thing should move, every resource has its own pull and push:

```bash
lps menu pull --env staging
git diff menus/                       # just the footer change? good
lps menu push --env production --yes
```

Same result as a sync button, restricted to exactly the change you reviewed, with a commit to show for it.

## The workflow this enables

Staging becomes where configuration is built and tested, production is where content lives, and Git is how configuration moves from one to the other:

```bash
lps diff --env staging --against production   # what's about to move
lps promote staging production                # move it
git commit -am "Promote staging: case studies, footer menu"
```

No dump, no search-replace on URLs, no content lost. And the next time someone asks what changed on production last Tuesday, the answer is a commit.

---

```bash
npm install -g @loopress/cli
```

ACF, SEO, menus, options, and theme styles work with Loopress Light. Everything else `promote` carries needs [Loopress Full](/wordpress-plugin/).
