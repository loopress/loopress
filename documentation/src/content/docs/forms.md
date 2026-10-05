---
title: Forms
description: Push, pull and list WordPress forms from the command line.
edition: full
---

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

Every command below also accepts the [common flags](/concepts/#common-flags): `--env`, `--json`, and `--yes` where it applies.

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
| `--dry-run` / `-d` | Show what would be written without touching the filesystem |

Local files with an id no longer present on WordPress are removed on pull, so the directory always mirrors the site. See [pull mirrors the site](/concepts/#pull-mirrors-the-site) for the confirmation asked first. Forms with no id are skipped with a warning.

**Example:**

```bash
lps form pull --dry-run
```

---

### `lps form push`

Upload `.json` files from a local directory to WordPress. Each form is matched by its `id`; if a local id doesn't exist on the target site (e.g. a fresh install), a new form is created instead and the local file is renamed to match the assigned id.

```bash
lps form push [path]
```

By default a push does **not** touch a form's notification or confirmation settings on the server: those decide where every submission is emailed and what the visitor sees, so a stray push must not be able to redirect them. Pass `--allow-notifications` to sync those sections too; recipient addresses are then validated and the sender address must be on the site's own domain.

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./forms` (or `loopress.json`'s `formDir`) | Local directory to read `.json` files from |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be pushed without making any changes |
| `--allow-notifications` | Also push each form's notification and confirmation settings (recipients, sender, messages) |

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
| `--json` | Output raw JSON instead of formatted text |

**Example output:**

```
Forms (2):
  12. Contact Form
  17. Newsletter Signup
```

---

### `lps form diff`

Show what differs between your local forms and a WordPress environment, or between two environments with `--against`. Also part of the aggregate [`lps diff`](/workflow/#lps-diff) (`--only form`).

```bash
lps form diff [path]
lps form diff --env staging --against production
```

Exits `0` in sync, `1` on drift, `2` when the comparison failed.

---

### `lps form rollback`

Restore forms on WordPress to the snapshot saved automatically before an earlier `lps form push`. See [Rollback and Snapshots](/rollback/).

```bash
lps form rollback            # the most recent snapshot
lps form rollback --list     # available snapshots
lps form rollback --to <id>  # an older one
```

## File format

Each form is stored as one file, named `{id}-{slug}.json`, where `{slug}` is the form title lowercased and slugified:

```
forms/
  12-contact-form.json
  17-newsletter-signup.json
```

Files round-trip WPForms' own export format untouched, the CLI only reads `id` to name the file and `settings.form_title` to display the form.
