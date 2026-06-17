---
title: ACF Field Groups
description: Pull and push Advanced Custom Fields field groups from the command line.
badge:
  text: Beta
  variant: caution
---

import { Aside } from '@astrojs/starlight/components';

<Aside type="caution" title="Beta feature">
ACF sync requires both the **Loopress plugin** and **Advanced Custom Fields (ACF)** to be active on the target WordPress site. The Loopress plugin provides the REST endpoint that the CLI consumes.
</Aside>

The `acf` command group lets you version-control [Advanced Custom Fields](https://www.advancedcustomfields.com/) field group definitions. Each field group is stored as a `.json` file that you commit to Git and deploy across environments.

## Requirements

- Loopress plugin installed and active on the WordPress site
- Advanced Custom Fields (free or Pro) installed and active
- Administrator credentials configured via `lps site config`

## Commands

### `lps acf pull`

Download all ACF field groups from WordPress and write them as JSON files.

```bash
lps acf pull [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./acf` | Directory where field group files are written |

| Flag | Description |
|------|-------------|
| `--dryRun` / `-d` | Show what would be written without touching the filesystem |

Each field group is saved as `<group-key>.json` (e.g. `group_64abc123.json`). The file contains the full field group definition including all nested fields.

**Example:**

```bash
lps acf pull
lps acf pull ./acf-groups --dryRun
```

---

### `lps acf push`

Upload field group JSON files to WordPress. If a group with the same key already exists it is updated; otherwise a new group is created.

```bash
lps acf push [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./acf` | Directory containing `*.json` field group files |

| Flag | Description |
|------|-------------|
| `--dryRun` / `-d` | Show what would be pushed without making any changes |

**Example:**

```bash
lps acf push
lps acf push ./acf-groups
```

## Typical workflow

```bash
# 1. Export field groups from the development site
lps site switch   # select development
lps acf pull

# 2. Commit to Git
git add acf/ && git commit -m "feat: add product fields group"

# 3. Deploy to staging / production
lps site switch   # select staging
lps acf push
```

## File format

```
acf/
  group_64abc123.json    ← one file per field group
  group_64def456.json
```

Each file is standard ACF export JSON, identical to what you would get from ACF's own **Tools → Export** screen. You can round-trip files between Loopress and the ACF UI without any conversion.
