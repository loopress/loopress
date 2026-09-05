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
| WordPress project | Select a project you have already configured with `lps project config`, or enter a project ID manually. When no project exists yet, `lps init` offers to run `lps project config` right away and continues with the project you create. |
| Root directory | Base directory for the project. All other paths are resolved relative to it. Defaults to `.`. |
| Snippets directory | Directory where snippet files are written and read. Relative to root. Defaults to `snippets`. |
| Other features | Optional multi-select for ACF, SEO, Forms, Pages, custom API routes, and single-page apps. Only the features you pick get their directory written to `loopress.json` (defaults: `acf`, `seo`, `forms`, `pages`, `api`, `apps`). |
| Snippet provider | The WordPress plugin used to manage snippets: [Code Snippets](https://wordpress.org/plugins/code-snippets/), [WPCode](https://wpcode.com/), or none if it's already installed. When you pick one, it's added to `plugins`. |

The final summary lists everything that was configured and the next useful command.

## Generated file

```json
{
  "projectId": "my-site",
  "rootDir": ".",
  "snippetsDir": "snippets",
  "plugins": {
    "code-snippets": "latest"
  }
}
```

Commit this file to Git. It ties the repository to a specific Loopress project and controls where `lps snippet pull` writes files.

## Fields reference

| Field | Default | Description |
|-------|---------|-------------|
| `projectId` | none | Name of the project configured via `lps project config`. Overrides the globally active project for all commands run in this directory. |
| `rootDir` | `.` | Base directory. All relative paths in `loopress.json` are resolved from here. |
| `snippetsDir` | `snippets` | Directory for snippet files, relative to `rootDir`. |
| `acfDir` | `acf` | Directory for ACF field groups, post types, taxonomies and options pages, relative to `rootDir`. Used by `lps acf pull/push`. |
| `seoDir` | `seo` | Directory for SEO settings, post meta and redirects, relative to `rootDir`. Used by `lps seo pull/push`. |
| `formDir` | `forms` | Directory for form files, relative to `rootDir`. Used by `lps form pull/push`. |
| `pageDir` | `pages` | Directory for page files, relative to `rootDir`. Used by `lps page pull/push`. |
| `apiDir` | `api` | Directory for custom API route files, relative to `rootDir`. Used by `lps api pull/push`. |
| `appsDir` | `apps` | Directory for single-page app bundles, relative to `rootDir`. Used by `lps app pull/push`. |
| `plugins` | none | WordPress.org plugins managed by Loopress (slugs). Populated by the snippet provider prompt in `lps init`, and by `lps plugin pull` and `lps plugin add`. |

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
