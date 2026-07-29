---
title: Version Control Your WordPress Code Snippets
description: Code Snippets are code. They deserve Git history, diffs, and rollbacks, not a copy-paste from the admin panel.
date: 2026-07-29
draft: false
authors:
  - maxime
tags:
  - code snippets
  - git
  - wordpress
  - beginners
excerpt: Most WordPress developers manage their code snippets by editing them directly in the admin panel. Here's a better way, one that gives you full Git history and lets you deploy changes like any other codebase.
---

If you use [Code Snippets](https://wordpress.org/plugins/code-snippets/) or [WPCode](https://wpcode.com/), you're probably editing your PHP functions directly in the admin panel. Click the snippet, make the change, save. Done.

It works. Until it doesn't.

Someone edits a snippet and breaks something. You don't know what changed. There's no history. You either remember what it looked like before, or you don't. There's no `git log`, no diff, no blame.

## How people try to solve this today

The current options aren't great.

**Option 1: WPCodeBox or Code Snippets Cloud**
These tools offer built-in versioning: you can see a history of changes and revert. It works, but it's locked inside their platform. Your code history lives in their database, not in your repo, and it doesn't integrate with your existing Git workflow.

**Option 2: Keeping snippets in your theme's `functions.php`**
This at least puts the code in a file you can version. But it ties snippets to your theme, means they disappear on theme switch, and turns `functions.php` into an unorganized dumping ground.

**Option 3: A custom plugin**
Some agencies build a site-specific plugin to hold all their custom code. This is better: it's version-controlled and theme-independent. But it requires setup for every project and doesn't give you a clean way to sync between environments.

None of these feel like a real developer workflow.

## The Loopress approach

Loopress treats your snippets as plain files in a Git repository. Pull them down from WordPress, edit them locally, push them back. Every change is a commit.

### Setup

Install the Loopress CLI:

```bash
npm install -g @loopress/cli
```

Configure your project:

```bash
lps project config
```

It asks for a project name, an environment (production, staging, local, or a custom name), and your WordPress URL. By default it then opens your browser to authorize and creates an Application Password for you automatically, no copy-pasting a generated password. If that flow can't complete, it falls back to asking for a WordPress username and an Application Password you generate yourself.

### Pull your snippets

```bash
lps snippet pull
```

This creates a `snippets/` directory with one `.php` file and one `.json` sidecar per snippet:

```
snippets/
  1-my-custom-function.php
  1-my-custom-function.json
  2-woocommerce-checkout-tweak.php
  2-woocommerce-checkout-tweak.json
  3-disable-gutenberg.php
  3-disable-gutenberg.json
```

Each `.php` file contains the raw snippet code. The `.json` sidecar stores the metadata (id, name, type, active status, tags) that Loopress uses to identify and update the snippet on WordPress.

### Edit locally

Open any file in your editor. Make changes. The feedback loop is your local environment, not the WordPress admin panel.

```bash
git add snippets/2-woocommerce-checkout-tweak.php
git commit -m "fix: apply discount code before tax calculation"
```

Now you have a commit. A diff. A message explaining why. This is reviewable, reversible, and shareable.

### Push back to WordPress

```bash
lps snippet push
```

Loopress syncs your local files back to WordPress via the REST API. No FTP, no copy-paste.

If you want to see what would change without actually changing anything:

```bash
lps snippet push --dry-run
```

## Working across environments

The real value shows up when you're working with local, staging, and production environments. Register each one once with `lps project config`, then target any of them with `--env` on a single command:

```bash
# Pull from production
lps snippet pull --env production

# Test locally, commit changes

# Push to staging first
lps snippet push --env staging

# When ready, push to production
lps snippet push --env production --yes
```

That trailing `--yes` isn't optional flair: pushing to an environment literally named `production` asks for confirmation in a terminal, and requires `--yes` to skip that prompt outside one (CI, scripts). `--env` also takes priority over whatever `lps project switch` last left active globally, which matters the moment more than one person runs commands against the same project.

Your snippets flow between environments the same way your code does. No database exports, no manual copy-paste.

## One thing to keep in mind

Loopress syncs snippets by ID (stored in the `.json` sidecar). If you pull first, the ID is saved and subsequent pushes update the correct snippet regardless of name changes. Without a sidecar ID, Loopress creates a new snippet. Treat the files as the source of truth once you're in this workflow.

---

If this resonates, the next step is `lps project config` and adding `snippets/` to your project's Git repository. From there, every snippet change is a commit.
