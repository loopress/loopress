---
title: Managing Multiple WordPress Sites as Code
description: Agencies managing 10, 20, or 50 WordPress sites need more than WP-CLI. They need a reproducible, Git-based workflow. Loopress is built for that.
date: 2026-06-09
draft: true
authors:
  - maxime
tags:
  - multisite
  - agencies
  - workflow
  - wordpress
excerpt: "WP-CLI is the standard for WordPress automation, but it requires server access and is stateless by nature. Loopress adds the missing layer: version-controlled configuration you can push to any site from your local machine."
---

WP-CLI is good. If you're managing WordPress at scale and you're not using it, start there first. But WP-CLI has a structural limitation: it runs on the server. Which means you need SSH access, and every command is a one-off operation: there's no state, no history, nothing committed.

For agencies managing dozens of client sites, that's not enough.

## What the typical agency workflow looks like

A client requests a change: update the navigation to add a new services section, push a custom snippet that adjusts their WooCommerce checkout, apply an updated stylesheet.

Without tooling, this is the workflow:
1. Connect to the server (SSH or SFTP)
2. Navigate to the right directory
3. Make the change directly, or copy-paste from a local file
4. Repeat for staging if they have it
5. Keep a mental note (or a Notion doc, or a Slack message to yourself) of what was changed

Multiply by twenty clients. Add in the context-switching between sites. Add in the fact that two developers might work on the same site. This is where things drift.

The "canonical" state of each site's configuration lives nowhere in particular. It's whatever's in the database at this moment.

## Loopress's multi-site model

Loopress stores site configurations locally, keyed by name:

```bash
lps site config
# Prompts for: site name, WordPress URL, application password
```

You can add as many sites as you need:

```bash
lps site config  # add client-a production
lps site config  # add client-a staging
lps site config  # add client-b production
```

Switch between them:

```bash
lps site switch
# Presents a list of configured sites
```

From that point, every Loopress command runs against the active site, or you can target one explicitly with `--site`.

## What a real agency workflow looks like

Each client project is a Git repository. Inside, alongside the theme and custom plugin code, lives the Loopress configuration:

```
client-a/
  snippets/
    checkout-tax-fix.php
    disable-comments.php
  menus/
    primary-nav.json
  styles/
    global.json
```

This directory is the source of truth. Not the database on production. Not "what's currently in the admin." The files.

A developer makes a change:

```bash
# Pull current state from staging
lps snippets pull --site client-a-staging

# Edit the snippet locally
vim snippets/checkout-tax-fix.php

# Commit
git add snippets/checkout-tax-fix.php
git commit -m "fix: tax exemption for nonprofit accounts"

# Push to staging for review
lps snippets push --site client-a-staging

# After sign-off, push to production
lps snippets push --site client-a-production
```

The change is tracked in Git. The commit message documents why. Another developer can pick this up, see the history, and understand what's deployed where.

## Propagating changes across clients

Some snippets are shared across all your clients: a security hardening function, a performance tweak, a GDPR compliance helper. Managing these without Loopress means copy-pasting the same code into twenty admin panels.

With Loopress:

```bash
# Update the shared snippet once
vim shared/snippets/security-headers.php

# Push to all clients
for site in $(lps site list); do
  lps snippets push --site $site --path shared/snippets/
done
```

Or from a CI pipeline, triggered by a commit to the shared snippets repository.

## The difference from WP-CLI

WP-CLI is a task runner. It executes commands against a running WordPress instance. It's excellent for bulk operations, one-off migrations, and scripting things that would otherwise require clicking through the admin.

Loopress is a synchronization layer. It treats configuration as files with a canonical version in Git, and provides push/pull operations to keep WordPress instances in sync with that version. The two tools complement each other: WP-CLI for server-side operations, Loopress for configuration management.

If you're already using WP-CLI in your agency workflow, Loopress fills the gap it leaves: the version-controlled, deployable configuration state that WP-CLI can manipulate but doesn't store.

---

The multi-site setup is covered in the [CLI documentation](/cli/getting-started/). The site management commands are under [`lps site`](/cli/).
