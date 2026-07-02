---
title: lps init
description: Generate a loopress.json config file interactively in the current directory.
---

`lps init` creates a `loopress.json` file in the current directory. Run it once at the root of each project you want to manage with Loopress.

```bash
lps init
```

The command is interactive: it prompts you for each field and writes the result to `loopress.json`.

## Prompts

| Prompt | Description |
|--------|-------------|
| WordPress project | Select a project you have already configured with `lps project config`, or enter a project ID manually. |
| Snippet plugin | `WPCode` or `Code Snippets`. Sets the default plugin used by `lps snippet pull/push`. |
| Root directory | Base directory for the project. All other paths are resolved relative to it. Defaults to `.`. |
| Snippets directory | Directory where snippet files are written and read. Relative to root. Defaults to `snippets`. |

## Generated file

```json
{
  "projectId": "my-site",
  "snippetPlugin": "wpcode",
  "rootDir": ".",
  "snippetsDir": "snippets"
}
```

Commit this file to Git. It ties the repository to a specific Loopress project and controls where `lps snippet pull` writes files.

## Fields reference

| Field | Default | Description |
|-------|---------|-------------|
| `projectId` | — | Name of the project configured via `lps project config`. Overrides the globally active project for all commands run in this directory. |
| `snippetPlugin` | `wpcode` | Default snippet plugin: `wpcode` or `code-snippets`. Overridden per-command with `--plugin`. |
| `rootDir` | `.` | Base directory. All relative paths in `loopress.json` are resolved from here. |
| `snippetsDir` | `snippets` | Directory for snippet files, relative to `rootDir`. |
| `plugins` | — | Pinned plugin versions (slug to version). Populated automatically by `lps plugin pull` and `lps plugin add`. |

## If loopress.json already exists

`lps init` will ask whether to overwrite the existing file. Choose **No** to keep the current config and abort.

## Next steps

```bash
# Pull your existing snippets from WordPress
lps snippet pull

# Snapshot your installed plugins
lps plugin pull

# Commit everything
git add loopress.json snippets/
git commit -m "chore: add loopress config"
```
