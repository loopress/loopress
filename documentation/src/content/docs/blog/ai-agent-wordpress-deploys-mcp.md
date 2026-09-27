---
title: Letting an AI Agent Deploy to WordPress, Without Handing It the Keys
description: The Loopress MCP server lets Claude Code or any MCP client pull and push WordPress configuration. Every change goes through a preview-then-confirm handshake the agent can't skip, and nothing the agent does bypasses Git.
date: 2026-11-12
draft: true
cliVersion: 0.26.0
wordpressPluginVersion: 2026.11.0
authors:
  - maxime
tags:
  - ai
  - mcp
  - agents
  - wordpress
excerpt: Coding agents are good at writing WordPress hooks and routes. The risky part is letting them deploy. Loopress's MCP server makes every push a two-step preview and confirm, with the preview re-checked right before anything is written.
---

An AI coding agent will happily write you a WordPress hook, an API route, or an ACF field group. Asking it to *deploy* one is where people get nervous, and they should. "The agent has admin access to production" is a sentence that ends in an incident report.

The usual compromise is to let the agent write files and do every deploy yourself. That works, and it also means the agent can't check its own work against a real site: it can't pull what's there, diff it, or confirm that its change landed.

The Loopress MCP server is built for the middle ground: the agent works against real environments, and a human sees exactly what will change before anything does.

## Setup

`@loopress/mcp` is an [MCP](https://modelcontextprotocol.io/) server that exposes Loopress CLI operations as tools. It doesn't reimplement anything: every tool shells out to the same `lps` binary you use by hand.

```bash
npm install -g @loopress/mcp
claude mcp add loopress -- lps-mcp
```

It runs from the directory your agent starts in, using that project's `loopress.json`. It never handles credentials: authentication stays in the CLI (`lps project config`), and the server only calls `lps`, which reads the stored application password. The agent never sees it.

## What the agent can do on its own

Everything that reads. Pull snippets, hooks, API routes, ACF objects, SEO settings, forms, menus, and options into local files. List what's on a site. And three tools that turn an agent into a decent operator:

- `project_diff`: what differs between the local files and an environment, or between two environments. "What's on staging that isn't on production?" becomes a question the agent can answer by itself.
- `project_doctor`: connectivity, plugin, and credential diagnostics, so "the push failed" comes with a reason.
- `validate_local`: checks that local files are well-formed and push-ready, without contacting WordPress at all.

Read tools run immediately. That's what makes the agent useful: it can look before it touches.

## What it can't do in one step

Every tool that changes a site, `hook_push`, `acf_push`, `option_remove`, `snippet_rollback` and the rest, needs two calls.

**The first call changes nothing.** It takes a private copy of the working directory, runs a dry run against the target environment from that copy, and returns the preview along with a single-use `confirmToken` that expires after five minutes.

**The second call, with that token, applies it**, but not blindly. It re-runs the same dry run from the same private copy, right before writing. If the result differs from the preview, because someone changed the site in the meantime, the call is refused and the agent has to start over with a fresh preview.

This design closes two gaps a naive "are you sure?" leaves open:

1. **The site changes between preview and apply.** An editor saves a snippet in wp-admin while you're reading the preview. The re-check catches it, instead of applying a plan built against a site that no longer exists.
2. **The files change between preview and apply.** The agent (or you) edits a file after the preview was generated. The apply runs from the private copy taken at preview time, so what gets pushed is exactly what was previewed.

The handshake can't be skipped, not by a flag, not for a "trusted" environment, not for production. In an agent client that asks before each tool call, that's your moment: the preview is on screen, and the second call only happens if you let it.

## Rollback is a tool too

Each push tool has a matching `_rollback` tool, backed by the snapshot every push takes before writing. Rollback goes through the same handshake, and its preview reports whether the environment changed since the original push, so neither you nor the agent restores over someone else's later edit without seeing it first.

## What we don't claim

Two known gaps, stated plainly in the [MCP reference](/cli/mcp/):

- A path argument pointing outside the working directory, or a `loopress.json` that maps a resource to an absolute path elsewhere, is read live at apply time, not from the private copy.
- The re-check and the write are still two separate requests, not one atomic operation. The window for a change to slip in is much narrower than preview-to-apply, but it isn't zero. Several resources (options, snippets, ACF, API routes, hooks, and more) add their own check on top, refusing a write when the item changed since it was read.

## Why this keeps Git in charge

The agent's changes are files in your working directory before they're anything else. It pushes what's on disk, so everything it deploys is something you can `git diff`, commit, and review like a teammate's pull request. An agent that edits a snippet directly in wp-admin leaves no trace. An agent that edits `snippets/checkout.php` and pushes it through Loopress leaves a diff.

---

```bash
npm install -g @loopress/cli @loopress/mcp
```

The [MCP server reference](/cli/mcp/) lists every tool, whether it mutates, and the parameters each one accepts.
