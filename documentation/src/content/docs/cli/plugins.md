---
title: Plugins
description: Sync installed WordPress plugins across environments with a manifest in Git.
---

The `plugins` command group lets you track installed WordPress plugins as a manifest in `loopress.json`. Once committed, any environment can be brought to the same set of installed, active plugins with a single command.

## How it works

Loopress stores managed plugins under the `plugins` key in `loopress.json`:

```json
{
  "plugins": {
    "woocommerce": "latest",
    "contact-form-7": "latest"
  }
}
```

The keys are [WordPress.org](https://wordpress.org/plugins/) plugin slugs. Installs and activations go through WordPress's own `wp/v2/plugins` REST API, which only ever installs the current stable release, so there is no version to pin, the value is always `"latest"`.

Need a specific, reproducible version instead? Manage that plugin through Composer and [wpackagist](https://wpackagist.org/) - see the [`composer` command group](/cli/composer/). Composer-managed plugins are automatically skipped by `plugin pull`/`plugin push`.

## Commands

### `lps plugin add`

Add a WordPress.org plugin to `loopress.json`.

```bash
lps plugin add <slug>
```

| Argument | Description |
|----------|-------------|
| `slug` | WordPress.org plugin slug (e.g. `woocommerce`) |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be written without touching `loopress.json` |

```bash
lps plugin add woocommerce
lps plugin add contact-form-7 --dry-run
```

Need to manage a Composer package instead? See the [`composer` command group](/cli/composer/) - Composer-managed plugins are automatically skipped by `plugin pull`/`plugin push`.

---

### `lps plugin pull`

Snapshot the plugins currently installed on WordPress into `loopress.json`.

```bash
lps plugin pull
```

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be written without making changes |

Loopress merges the remote state into the existing manifest; new plugins are added.

**Example output:**

```console
Pulling plugins from https://example.com
Wrote 4 plugins to loopress.json
  + Added: contact-form-7, yoast-seo
```

---

### `lps plugin push`

Sync the plugins on WordPress to match `loopress.json`.

```bash
lps plugin push
```

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would change without making any changes |

Before making any change, the command prints a diff:

- **To install** — plugins in the manifest that are not on the site
- **To activate** — plugins installed but not yet active

Missing plugins are installed and activated automatically.

**Example output:**

```console
Pushing plugins to https://example.com

To install (1):
  + contact-form-7

Installing contact-form-7...
  ✓ contact-form-7 installed and activated
```

## Typical workflow

```bash
# 1. Capture the current state from your reference environment
lps project switch   # select production
lps plugin pull

# 2. Commit the manifest
git add loopress.json && git commit -m "chore: track managed plugins"

# 3. Apply to another environment
lps project switch   # select staging
lps plugin push
```

## Dry run

All three commands accept `--dry-run` (`-d`). Use it to preview changes before committing:

```bash
lps plugin pull --dry-run
lps plugin push --dry-run
lps plugin add yoast-seo --dry-run
```
