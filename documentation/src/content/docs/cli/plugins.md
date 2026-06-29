---
title: Plugins
description: Sync WordPress plugin versions across environments with a manifest in Git.
---

The `plugins` command group lets you track installed WordPress plugins as a versioned manifest in `loopress.json`. Once committed, any environment can be brought to the exact same plugin state with a single command.

## How it works

Loopress stores plugin versions under the `plugins` key in `loopress.json`:

```json
{
  "plugins": {
    "woocommerce": "9.0.2",
    "contact-form-7": "5.9.8"
  }
}
```

The keys are [WordPress.org](https://wordpress.org/plugins/) plugin slugs; the values are pinned versions. When you run `lps plugin pull`, Loopress also disables auto-updates for every managed plugin so version drift cannot happen silently.

## Commands

### `lps plugin require`

Add a plugin to `loopress.json`, resolving its current version from WordPress.org.

```bash
lps plugin require <slug> [version]
```

| Argument | Description |
|----------|-------------|
| `slug` | WordPress.org plugin slug (e.g. `woocommerce`) |
| `version` | Version to pin. Omit to resolve the latest version automatically. |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be written without touching `loopress.json` |

**Examples:**

```bash
lps plugin require woocommerce          # pins latest stable version
lps plugin require woocommerce 9.0.2   # pins a specific version
lps plugin require contact-form-7 --dry-run
```

---

### `lps plugin pull`

Snapshot the plugins currently installed on WordPress into `loopress.json`.

```bash
lps plugin pull
```

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be written without making changes |

Loopress merges the remote state into the existing manifest (new plugins are added, version changes are noted) and then disables auto-updates for every managed plugin on the site.

**Example output:**

```console
Pulling plugins from https://example.com
Wrote 4 plugins to loopress.json
  + Added: contact-form-7, yoast-seo
  ~ Updated: woocommerce 9.0.1 → 9.0.2
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
- **Version mismatch** — plugins where the site version differs from the manifest

Missing plugins are installed and activated automatically. For each version mismatch, Loopress prompts you before syncing.

**Example output:**

```console
Pushing plugins to https://example.com

To install (1):
  + contact-form-7 @ 5.9.8

Version mismatch (1):
  ~ woocommerce: site has 9.0.1, manifest wants 9.0.2

Installing contact-form-7 @ 5.9.8...
  ✓ Plugin installed and activated
```

## Typical workflow

```bash
# 1. Capture the current state from your reference environment
lps project switch   # select production
lps plugin pull

# 2. Commit the manifest
git add loopress.json && git commit -m "chore: pin plugin versions"

# 3. Apply to another environment
lps project switch   # select staging
lps plugin push
```

## Dry run

All three commands accept `--dry-run` (`-d`). Use it to preview changes before committing:

```bash
lps plugin pull --dry-run
lps plugin push --dry-run
lps plugin require yoast-seo --dry-run
```
