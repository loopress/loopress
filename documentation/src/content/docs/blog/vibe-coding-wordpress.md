---
title: Your WordPress Site Is a Better Vibe Coding Target Than You Think
description: Everyone vibe codes Next.js and Supabase. But WordPress already ships auth, roles, an admin and media, so the agent only writes glue. What's missing is a workflow the agent can use, and guardrails for the code nobody reviews.
date: 2026-12-03
draft: true
cliVersion: 0.32.2
wordpressPluginVersion: 2026.17.1
authors:
  - maxime
tags:
  - ai
  - workflow
  - wordpress
excerpt: For anything that looks like a website with features, WordPress is a better vibe coding target than a fresh React app. The agent writes less code, so it gets more right. What it lacks is a loop it can drive, and a tool careful enough for code nobody reviews.
---

Open any "I built this in a weekend with AI" thread and the stack is always the same: Next.js, Tailwind, Supabase. It's a great stack for starting from zero. But most of the web isn't starting from zero. More than 40% of it runs on WordPress, and those sites need new features too.

So here's a take: for a lot of real projects, WordPress is a *better* vibe coding target than a fresh React app. Not for building the next Linear. For everything that looks like a website with features: a store, a membership area, a booking flow, an internal tool behind a login.

## The agent writes less code, so it gets more right

When you vibe code an app from scratch, the AI rebuilds authentication, user roles, an admin panel, media uploads, forms and emails. That's where vibe-coded apps break, and where the security horror stories come from (hello, misconfigured row-level security).

WordPress ships all of that, tested by millions of sites. Your agent only writes the glue: a hook, a REST endpoint, a custom post type, a block. Small, focused code is exactly what models are good at, and they have seen an enormous amount of WordPress code.

## So why doesn't anyone vibe code WordPress?

Because the workflow fights the agent. Three problems:

1. **Half the site lives in the database.** Field groups, options, menus, templates: none of it is a file. An agent that can't read it is coding blind.
2. **There's no loop.** Vibe coding works because of the tight cycle: edit, check, ship, undo. Classic WordPress is "paste it in functions.php and refresh production."
3. **Production is the preview.** A bad line of PHP doesn't break one component, it can take the whole site down.

None of these are WordPress problems. They're workflow problems, and that's what [Loopress](https://loopress.dev) fixes.

## What changes with Loopress

Loopress turns a WordPress site into files in a Git repo, and gives you (and your agent) a CLI to move them back and forth:

- **Everything but the content, as files.** Hooks and API routes as modern PHP classes, plus ACF field groups, pages, templates, menus, options and Global Styles. `lps pull` brings the live site into your repo, so the agent sees what's really there.
- **Built for agents.** Claude Code, Cursor or any agent drives the `lps` CLI directly, and the [MCP server](/cli/mcp/) exposes pull and push as tool calls, each push previewed before it applies.
- **A real loop.** Edit locally, `lps push --dry-run` to check, `lps push` to ship, `lps promote staging production` when it's ready.

## The guardrails, because vibe coders don't read diffs

Let's be honest: if you vibe code, you're not reviewing every line. So the tool has to be careful for you:

- **PHP is syntax-checked on the server before anything is written.** A batch of hooks or routes with one broken file is refused whole, and WordPress stays untouched.
- **One broken hook doesn't take the site down.** A hook file that fails to load is skipped and logged, the rest keep running.
- **Every push is snapshotted.** `lps hook rollback` (same for snippets, pages, ACF, menus, options) restores the previous state in one command. See [Undoing a bad WordPress deploy](/blog/undo-a-wordpress-deploy/).
- **It won't overwrite what someone changed in wp-admin.** If the site changed outside Loopress since your last push, the push stops and names what would be lost.
- **Production asks first.** Pushing to `production` needs a confirmation, or an explicit `--yes` in CI.
- **Drift detection for CI.** `lps diff` exits non-zero when your repo and the site disagree.
- **Plugin health.** `lps plugin audit` flags pinned plugins with known vulnerabilities, or that look abandoned.

## Where it's not a fit

If you're building a multi-tenant SaaS with complex relational data and realtime updates, use the Next.js and Supabase stack. WordPress's data model wasn't designed for that, and no tool changes it.

And guardrails don't replace judgment. A syntax check won't catch a missing permission check on an API route. Ask your agent to review its own code for nonces, escaping and capability checks before you ship, and keep a staging environment.

## Try it

If you already have a WordPress site, you already have the backend. Give your agent the workflow:

```bash
npm install -g @loopress/cli
lps init
```

Hooks and API routes need the Full edition of the [WordPress plugin](/wordpress-plugin/), from loopress.dev, not the Light build on WordPress.org. Then ask your agent to build the feature you've been putting off. Loopress is open source and free.
