---
title: Rollback and Snapshots
description: Undo a push. Every real push saves a snapshot of what it replaced, and rollback restores it.
---

Every real `push` (not a `--dry-run`) saves a snapshot of the environment's state right before it writes anything. `rollback` restores that state.

```bash
lps snippet rollback            # undo the most recent snippet push
lps snippet rollback --list     # list the available snapshots
lps snippet rollback --to 1732000000000
lps snippet rollback --dry-run  # show what would be restored
```

## Which resources support it

| Resource | Command |
|----------|---------|
| [Snippets](/snippets/) | `lps snippet rollback` |
| [ACF](/acf/) | `lps acf rollback` |
| [SEO](/seo/) | `lps seo rollback` |
| [Forms](/forms/) | `lps form rollback` |
| [Menus](/menus/) | `lps menu rollback` |
| [Custom Post Types](/custom-post-types/) | `lps cpt rollback` |
| [Taxonomies](/taxonomies/) | `lps taxonomy rollback` |
| [Options](/options/) | `lps option rollback` |
| [Theme Styles](/theme-styles/) | `lps theme style rollback` |
| [API routes](/api/cli/) | `lps api rollback` |
| [Hooks](/hooks/) | `lps hook rollback` |

Plugins, themes, Composer, static pages, templates and apps have no rollback: to go back, check out the previous version of your files in Git and push again. For plugins, keep in mind that a downgrade replaces files only, it does not undo database migrations.

## Flags

| Flag | Description |
|------|-------------|
| `--list` | List the available snapshots (id, timestamp, environment) instead of rolling back |
| `--to <id>` | Restore this snapshot instead of the most recent one |
| `--dry-run` / `-d` | Show what would be restored without changing anything |
| `--yes` / `-y` | Roll back even if the environment changed since that push |
| `--env <name>` | Roll back this environment instead of the active one |

## Where snapshots live

Snapshots are written on the machine that ran the push, in `.loopress/snapshots/<resource>/<environment>/` at the root of your project. The CLI keeps the last 10 per resource and environment, pruning the oldest. The `.loopress/` directory ignores itself in Git, so snapshots are never committed.

A push run in CI therefore saves its snapshot on the runner, where it disappears with the job. To undo a CI deploy, revert the commit and let the pipeline push again.

## How a rollback is applied

1. **Drift check.** The CLI reads the environment and compares it with the state right after the push that saved the snapshot. If something changed since (an edit in wp-admin, another push), it shows the difference and asks before overwriting it. In CI, pass `--yes` to roll back anyway.
2. **Targeted restore.** Only the objects that differ from the snapshot are written back, the rest is left alone.
3. **No deletion.** An object that exists now but not in the snapshot (created after it) is **not** removed. The CLI warns about it, delete it yourself if needed.

Your local files are not changed by a rollback. Run the resource's `pull` afterwards to bring them back in line with the site.

## From an AI agent

Each rollback is also an [MCP tool](/cli/mcp/#tools) (`snippet_rollback`, `acf_rollback`, ...), behind the same two-step confirmation as every mutating tool. Like every mutating tool, it refuses an environment named `production`, including when `production` is the default environment, and the confirmed call rolls back the environment that was previewed. See [Confirming changes](/cli/mcp/#confirming-changes).
