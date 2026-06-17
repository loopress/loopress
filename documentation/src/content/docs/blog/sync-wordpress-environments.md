---
title: Syncing WordPress Configuration Between Environments Without a Database Dump
description: Pushing a menu change from staging to production shouldn't require a full database sync. Loopress lets you push specific configuration as code.
date: 2026-06-09
draft: true
authors:
  - maxime
tags:
  - environments
  - workflow
  - staging
  - wordpress
excerpt: The standard answer for syncing WordPress between environments is "sync the database." That's a nuclear option for what should be a surgical change. Loopress treats menus and styles as files you can push independently.
---

You've updated a menu on staging. Added a new item, reorganized the structure. Now you need to get that change to production.

The standard answer: sync the database.

Which means: overwrite production content with staging content. Including any posts, comments, or option changes that happened on production since your last sync. It's a nuclear option for what should be a surgical change.

## How teams handle this today

The tools people reach for (WP Staging, Duplicator, hosting-provider sync buttons) all operate at the database level. They're useful for full environment clones, but they're blunt instruments.

The alternatives are worse:

**Recreate manually**: open production, manually recreate the menu you built on staging. Fine for three items. Painful for thirty. Error-prone either way.

**WP-CLI `wp menu`**: the right idea, wrong UX. You'd need to script it yourself: query the staging menu structure, translate it to a series of `wp menu item add` commands, run them on production. Possible but nobody does it because the investment isn't worth it for occasional changes.

**Custom import/export scripts**: some agencies build these. They live in a Gist somewhere, they're half-documented, and they only work for the exact WordPress version they were written against.

The result is that configuration changes (menus, global styles, widget layouts) drift between environments. Staging shows one thing. Production shows another. The "real" version is whoever's memory is most accurate.

## Treating configuration as code

Loopress takes a different approach: menus and styles are serialized as JSON files in your project. You pull them from one environment, commit them, and push to another.

### Menus

Pull the current menu structure from production:

```bash
lps menu pull --url https://production.example.com
```

This writes a JSON file representing the full menu structure: items, labels, URLs, hierarchy. Update it, or pull from staging instead:

```bash
lps menu pull --url https://staging.example.com
```

Commit the change:

```bash
git add menus/
git commit -m "nav: add Services submenu"
```

Push to production:

```bash
lps menu push --url https://production.example.com
```

That's the entire workflow. No database involved. No manual recreation. The diff shows exactly what changed: which menu items were added, removed, or reordered.

### Global styles

The same pattern applies to WordPress global styles (the CSS customizations from the Site Editor):

```bash
lps styles pull  # pulls from configured site
lps styles push --url https://production.example.com
```

Global styles are a pain point for teams using the block editor. Every environment ends up with slight variations: font size tweaks made directly in production, color palette changes that never made it back to staging. Loopress gives you a file you can diff and version.

## Where this fits in a real workflow

The practical use case is a deployment checklist that looks like this:

```bash
# Before deploying
lps snippets push --url https://production.example.com
lps menu push --url https://production.example.com
lps styles push --url https://production.example.com
```

You could wrap this in a shell script or a CI step. The point is that configuration changes become explicit, versioned, and deployable, the same as any other code change.

## The multi-environment problem for agencies

Agencies managing multiple client sites hit this problem constantly. Client A wants the menu changed on three environments. Client B needs a style tweak applied everywhere. Without tooling, this is manual work multiplied by the number of environments.

Loopress's multi-site support (`lps site config`, `lps site switch`) lets you maintain named configurations per site and per environment. Push the same menu to ten sites:

```bash
for site in client-a client-b client-c; do
  lps menu push --site $site
done
```

This is what WordPress configuration management looks like when it's treated as code rather than database state.

---

The full CLI reference is in the [Loopress docs](/cli/menus/). If you're starting from scratch, [Getting Started](/cli/getting-started/) covers the authentication setup.
