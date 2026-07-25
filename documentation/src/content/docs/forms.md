---
title: Forms
description: Push, pull and list WordPress forms from the command line.
---

:::note
`form` talks to REST endpoints provided by [Loopress Full](/wordpress-plugin/), the free full edition of the plugin, not Loopress Light. Install it on the site before using these commands.
:::

The `form` command group lets you version-control forms as plain JSON files in Git.

Requires [WPForms](https://wpforms.com/) to be installed and active on the WordPress site. Other form plugins aren't supported yet.

## Typical workflow

```bash
# 1. Download existing forms from WordPress
lps form pull

# 2. Edit locally, commit to Git
git add forms/ && git commit -m "feat: update contact form"

# 3. Deploy back to WordPress
lps form push
```

## Commands

### `lps form pull`

Download all forms from WordPress and write them as `.json` files, one per form.

```bash
lps form pull [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./forms` (or `loopress.json`'s `formDir`) | Local directory where forms are written |

| Flag | Description |
|------|-------------|
| `--dryRun` / `-d` | Show what would be written without touching the filesystem |

Local files with an id no longer present on WordPress are removed on pull, so the directory always mirrors the site. Forms with no id are skipped with a warning.

**Example:**

```bash
lps form pull --dryRun
```

---

### `lps form push`

Upload `.json` files from a local directory to WordPress. Each form is matched by its `id`; if a local id doesn't exist on the target site (e.g. a fresh install), a new form is created instead and the local file is renamed to match the assigned id.

```bash
lps form push [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./forms` (or `loopress.json`'s `formDir`) | Local directory to read `.json` files from |

| Flag | Description |
|------|-------------|
| `--dryRun` / `-d` | Show what would be pushed without making any changes |

**Example:**

```bash
lps form push ./forms
```

---

### `lps form list`

Print all forms currently on WordPress.

```bash
lps form list
```

| Flag | Description |
|------|-------------|
| `--json` / `-j` | Output raw JSON instead of formatted text |

**Example output:**

```
Forms (2):
  12. Contact Form
  17. Newsletter Signup
```

## File format

Each form is stored as one file, named `{id}-{slug}.json`, where `{slug}` is the form title lowercased and slugified:

```
forms/
  12-contact-form.json
  17-newsletter-signup.json
```

Files round-trip WPForms' own export format untouched, the CLI only reads `id` to name the file and `settings.form_title` to display the form.

:::tip
Always run `lps form pull` before editing locally so filenames stay in sync with each form's `id`.
:::
