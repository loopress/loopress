---
title: Undoing a Bad WordPress Deploy Without Restoring a Backup
description: A backup restore rolls back everything, including the orders and comments that arrived since. Loopress snapshots each resource before every push, so you can undo just the change that broke the site.
date: 2027-01-05
draft: true
cliVersion: 0.37.0
wordpressPluginVersion: 2026.21.0
authors:
  - maxime
tags:
  - rollback
  - deployment
  - workflow
  - wordpress
excerpt: When a deploy breaks a WordPress site, the usual undo button is a full backup restore, which also erases every order, comment, and form entry since. Loopress keeps a snapshot of what each push replaced, so undoing a deploy touches only what the deploy touched.
---

You push a change to a snippet, the checkout page starts throwing errors, and you need the previous version back. Now.

On most WordPress sites the undo button is the host's backup restore. It works, and it rolls back everything: the snippet, but also every order placed, comment posted, and form submitted since the backup was taken. To undo a five-line change, you erase an hour of real business.

## What "undo" should mean

A deploy changes a known set of things. Undoing it should put those things back and leave everything else alone. That needs two pieces of information: what the push replaced, and what it left behind.

Every `lps <resource> push` records both. Right before writing anything, it saves a snapshot of the environment's current state for that resource (the "before"), along with what the push is about to write (the "after"). Then it pushes.

```bash
lps snippet push --env production --yes
# ...checkout breaks...
lps snippet rollback --env production
```

`rollback` restores the most recent snapshot. It shows you what it's about to change first, one line per item, with a patch for each modified one, and asks before writing.

## Pick an older snapshot

```bash
lps snippet rollback --list
```

```text
Snapshots for "snippet" on "production" (most recent first):
  1759312800000  2026-10-01T10:00:00.000Z
  1759226400000  2026-09-30T10:00:00.000Z
```

```bash
lps snippet rollback --to 1759226400000 --dry-run
```

`--dry-run` prints the restore plan and stops. The last 10 snapshots are kept per resource and per environment.

## The part that makes it safe: drift detection

A rollback is only harmless if nobody touched the site since the push. Say an editor fixed a typo in a snippet through wp-admin ten minutes after your deploy. Blindly restoring the pre-deploy state would silently erase their fix.

So before restoring, `rollback` compares the environment's current state with the "after" half of the snapshot, what your push expected to leave behind. If they differ, something else changed the site in between, and you get that diff first:

```text
Snippets has changed on https://example.com since that push:
  ~ 12
```

(Snippets are identified by their WordPress id, `12` here, followed by a patch of what changed.)

In a terminal, you're asked whether to overwrite those later changes, and the default answer is no. In a script or CI, the command refuses outright unless you pass `--yes`. You decide with the evidence in front of you, instead of finding out from the editor on Monday.

The same idea protects the push itself: a push that would overwrite something edited on the site since your last pull or push stops and names it, unless you pass `--overwrite`. More on that in [A client changed a field group in wp-admin](/blog/wordpress-config-drift-detection/).

## What it covers

Every resource that has a `push` has a `rollback`: snippets, ACF objects, API routes, hooks, forms, menus, tracked options, theme styles, pages, apps, and the rest. Each has its own command (`lps acf rollback`, `lps hook rollback`, and so on), because each push takes its own snapshot. The aggregate `lps push` goes through the same per-resource pushes, so a full deploy leaves one snapshot per resource it touched.

Plugins, theme versions and Composer dependencies go through the site's Composer: their rollback runs it again with the earlier versions. A rollback that downgrades a package needs `--force`, for the reason any downgrade does: it replaces files, it doesn't undo the database migrations the newer version ran.

## Two limits worth knowing before you rely on it

**For most resources, restoring creates and updates, it never deletes.** If your bad push *added* a new snippet, rolling back restores everything that push changed, but the new snippet stays. The command tells you so, naming each item present now but absent from the snapshot, so you can remove it by hand. This is deliberate: a snippet push never deletes, so a rollback, which is a push of the old state, doesn't either. The exceptions are the resources whose push installs a whole set: a plugin, theme or Composer package the push installed is uninstalled by the rollback, an app the push created is removed, and a theme template rollback writes the whole child theme back.

**Snapshots live on the machine that pushed.** They're written to `.loopress/snapshots/` at the root of your project, and that directory ignores itself in Git: a snapshot holds the environment's full state for that resource, not something to commit. The flip side is that a push from a CI runner leaves its snapshot on the runner, which is gone once the job ends. If production deploys only happen in CI, a rollback from your laptop has nothing to restore. For that setup, the undo path is Git: revert the commit, let CI push again.

## Where this fits

Backups are still your disaster recovery. A broken server, a corrupted database, a compromised site: restore the backup. Rollback is for the far more common case, a deploy that did exactly what you asked and it turned out to be the wrong thing. That case deserves an undo that is as narrow as the change.

---

```bash
npm install -g @loopress/cli
```

Rollback works for every resource your edition of the plugin syncs. The [Rollback reference](/rollback/) covers every flag and the exact behavior of each resource.
