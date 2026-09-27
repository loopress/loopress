---
title: Deploying to a CMS Your Editors Are Editing at the Same Time
description: A WordPress deploy races against every admin screen on the site. How Loopress refuses to overwrite a change it hasn't seen, and why a push of ten route files now lands all at once or not at all.
date: 2026-11-26
draft: true
cliVersion: 0.26.0
wordpressPluginVersion: 2026.11.0
authors:
  - maxime
tags:
  - engineering
  - concurrency
  - deployment
  - wordpress
excerpt: Deploying code to a server nobody else writes to is a solved problem. Deploying configuration to a WordPress site whose editors are saving settings at the same moment is not. Two failure modes, and what we built for each.
---

Deploying a Node app is, conceptually, simple: nobody else is writing to the server. What's in Git is what runs, and the deploy replaces one with the other.

A WordPress site doesn't work like that. The same configuration a deploy writes, a snippet, a form, an SEO template, a plugin's settings, can also be written by anyone with an admin account, through a screen, at any moment. Including the moment your deploy runs.

That makes every Loopress push a race, and we found two ways to lose it.

## Failure 1: the lost update

A push reads nothing and writes everything: "make the site's snippet 12 look like my file". Meanwhile, on production, an editor opened snippet 12 in wp-admin, fixed a typo, and saved.

Order the events one way and the editor's fix lands after your push: fine. Order them the other way and your push lands after the fix and silently erases it. Nobody gets an error. The typo comes back, and nobody knows why.

This is the classic *lost update*, and the classic fix is optimistic concurrency control: don't write unless the thing you're overwriting is the thing you think you're overwriting.

### What a push does now

For snippets, forms, ACF objects, API routes, hooks, SEO settings, menus, and tracked options, every item the Loopress plugin returns carries a `revision`: a content hash of the fields a write can change. A push:

1. reads the item's current `revision` right before writing it,
2. sends its write along with that value as `expectedRevision`,
3. and the plugin recomputes the hash and refuses the write with `412 Precondition Failed` if it no longer matches.

A 412 means someone changed the item between your read and your write. The push reports it for that item instead of overwriting, and the fix is the boring, correct one: pull, look at what they changed, decide, push again.

A few details that took more thought than the idea itself:

- **The hash only covers what a write changes.** ACF stamps a `modified` time on every save; a form plugin keeps its own bookkeeping fields. Hashing those would make every item look changed all the time. The revision leaves them out.
- **The revision never touches your files.** It's request bookkeeping, not configuration. `lps option pull` writes your option's value, not a hash that would show up in every `git diff`.
- **First pushes aren't conditional.** An item that doesn't exist on the site yet has nothing to compare against, so its creation goes through as before.

### What it doesn't do

This is not a database-level compare-and-swap. The plugin checks the revision and then writes, inside one request, and a save landing in between those two steps can still slip through. The window used to be "the whole time between reading the site and writing it", potentially minutes for a large push. Now it's the execution time of one request. Much smaller, not zero, and we'd rather say so than claim otherwise.

## Failure 2: the half-applied push

API routes and hooks are PHP files in a directory on the server. A push of ten route files used to be ten HTTP requests, one file each.

Now imagine file 7 fails: a syntax error the server-side check catches, a class name that collides with another plugin, a network blip. Files 1 to 6 are already live. Files 7 to 10 aren't. If file 3 calls a helper that file 8 was supposed to update, the site now runs a combination of code that never existed in any commit.

The only way to find out was `lps diff` after the fact.

### One request, one swap

`lps api push` and `lps hook push` now send the whole set in a single batch request, and the plugin applies it in three steps:

1. **Stage.** Create a sibling directory next to the live one and seed it with a copy of every file currently live.
2. **Validate and write into the staging copy.** Every file in the push goes through the same checks as before, syntax, one class per file, `declare(strict_types=1)`, no class collision, and is written into the staging directory, never the live one. Files removed with `--prune` are deleted there too.
3. **Swap.** Only if every single file passed, replace the live directory with the staging one using a directory `rename()`.

A rename within the same filesystem is atomic on the filesystems WordPress actually runs on: a request loading routes sees either the complete old set or the complete new set, never a mix. If anything fails at step 2, the staging directory is thrown away and the live directory was never touched.

Seeding the staging directory with the live files is what makes this work for a partial push. Pushing one route file still results in a full, consistent directory, the new file plus every other route exactly as it was.

## Why this matters more than it sounds

Neither failure is dramatic. Nobody's site goes down. What happens instead is worse in a quieter way: the site ends up in a state nobody can explain, and "what does production actually run?" stops having an answer. A deploy tool's whole job is to keep that question answerable. Refusing to overwrite what it hasn't seen, and refusing to leave anything half-written, are how it keeps its promise even when it's not the only one writing.

---

```bash
npm install -g @loopress/cli
```

API routes and hooks are [Loopress Full](/wordpress-plugin/) features. Conditional writes apply wherever the resource is available, in Light or Full.
