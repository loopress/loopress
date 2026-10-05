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
| Other features | Optional multi-select for ACF, SEO, Menus, Forms, custom API routes, hooks, single-page apps, static pages, block templates, and block template parts. Only the features you pick get their directory written to `loopress.json`, with its [default name](/loopress-json/#resource-directories). |
| Snippet provider | The WordPress plugin used to manage snippets: [Code Snippets](https://wordpress.org/plugins/code-snippets/), [WPCode](https://wpcode.com/), or none if it's already installed. When you pick one, it's added to `plugins`. |

It also adds `* text=auto eol=lf` at the top of a `.gitattributes` file next to `loopress.json`. It creates the file if needed, leaves it alone if the rule is already there, and keeps your own rules after it so they still take precedence (for example `*.bat text eol=crlf`). Git for Windows checks files out with CRLF line endings by default, so without this rule a snippet cloned on Windows would no longer match, byte for byte, what `pull` writes.

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

Commit this file to Git. It ties the repository to a specific Loopress project and controls where every command reads and writes files. Every field, including the directories of the features you didn't pick, is documented in the [loopress.json reference](/loopress-json/).

## If loopress.json already exists

`lps init` will ask whether to overwrite the existing file. Choose **No** to keep the current config and abort.

## Next steps

```bash
# Pull your existing snippets from WordPress
lps snippet pull

# Snapshot your installed plugins
lps plugin pull

# Commit everything
git add loopress.json .gitattributes snippets/
git commit -m "chore: add loopress config"
```
