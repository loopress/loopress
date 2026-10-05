---
title: Menus
description: Push, pull and list WordPress nav menus and the active theme's menu locations from the command line.
edition: light
---

The `menu` command group lets you version-control WordPress nav menus (Appearance > Menus) as plain JSON files in Git, one file per menu, plus the active theme's menu locations.

A menu item's `post_type`/`taxonomy` target is never synced by its raw WordPress id, ids are not the same on two environments. Instead each item is resolved by identity: a post type or taxonomy slug (`object`) plus the target's own slug (`objectSlug`). For a child page, `objectSlug` is its full path (`account/profile`), since several pages can share the slug `profile` under different parents. A bare slug still resolves when exactly one page has it, and fails with the list of matching paths when several do. `menu push` re-resolves that identity on the target environment every time; if the target doesn't exist there, the push fails clearly instead of guessing or silently dropping the item.

Menu locations (which menu is assigned to "Primary Navigation", "Footer", etc.) are a per-theme setting in WordPress, not a site-wide one. `menu pull`/`menu push` read and write them for whichever theme is active at the time.

## Typical workflow

```bash
# 1. Download existing menus and locations from WordPress
lps menu pull

# 2. Edit locally, commit to Git
git add menus/ && git commit -m "feat: add a footer menu"

# 3. Deploy back to WordPress
lps menu push
```

## Commands

Every command below also accepts the [common flags](/concepts/#common-flags): `--env`, `--json`, and `--yes` where it applies.

### `lps menu pull`

Download every nav menu and the active theme's menu locations from WordPress and write them as `.json` files.

```bash
lps menu pull [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./menus` (or `loopress.json`'s `menuDir`) | Local directory where menus are written |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be written without touching the filesystem |

Local menu files no longer present on WordPress are removed on pull, so the directory always mirrors the site. See [pull mirrors the site](/concepts/#pull-mirrors-the-site) for the confirmation asked first. `menu-locations.json` is a single file, not a list, so it's always overwritten in place.

**Example:**

```bash
lps menu pull --dry-run
```

---

### `lps menu push`

Upload local `.json` files to WordPress.

```bash
lps menu push [path]
```

Each menu is matched by its own `slug`, which is its permanent identity, like ACF's `key`. Pushing a menu replaces every one of its items on the target with a freshly built tree from the file: there's no stable identity for a menu item itself to diff against, so a menu syncs as one atomic unit. Every `post_type`/`taxonomy` item is re-resolved by `object`/`objectSlug` on the target environment first; if any item can't be resolved there, the whole push for that menu fails before anything is written, rather than partially rebuilding it.

A `custom` item whose URL is absolute and points at a different domain than the target environment produces a warning, not a failure, menus can legitimately link off-site. It's a nudge to double check before syncing the same menu to another environment.

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./menus` (or `loopress.json`'s `menuDir`) | Local directory to read `.json` files from |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be pushed without making any changes |

**Example:**

```bash
lps menu push ./menus
```

---

### `lps menu list`

Print every nav menu and the active theme's menu locations currently on WordPress.

```bash
lps menu list
```

| Flag | Description |
|------|-------------|
| `--json` | Output raw JSON instead of formatted text |

**Example output:**

```
main (Main Menu): 4 item(s)
footer (Footer Menu): 2 item(s)

locations:
  primary: main
  footer: footer
  social: (unassigned)
```

---

### `lps menu diff`

Show what differs between your local menus and menu locations and a WordPress environment, or between two environments with `--against`. Also part of the aggregate [`lps diff`](/workflow/#lps-diff) (`--only menu`).

```bash
lps menu diff [path]
lps menu diff --env staging --against production
```

Exits `0` in sync, `1` on drift, `2` when the comparison failed.

---

### `lps menu rollback`

Restore menus and menu locations on WordPress to the snapshot saved automatically before an earlier `lps menu push`. See [Rollback and Snapshots](/rollback/).

```bash
lps menu rollback            # the most recent snapshot
lps menu rollback --list     # available snapshots
lps menu rollback --to <id>  # an older one
```

## File format

```
menus/
  main.json
  footer.json
  menu-locations.json
```

Each menu file holds `{ "slug", "name", "items", "warnings" }`. `items` is a tree (children nested under their parent, not a flat list with parent ids) for a readable git diff:

```json
{
  "slug": "main",
  "name": "Main Menu",
  "items": [
    {
      "type": "post_type",
      "object": "page",
      "objectSlug": "about",
      "title": "",
      "url": null,
      "classes": [],
      "target": "",
      "xfn": "",
      "description": "",
      "children": [
        {
          "type": "custom",
          "object": null,
          "objectSlug": null,
          "title": "External docs",
          "url": "https://docs.example.com",
          "classes": [],
          "target": "_blank",
          "xfn": "",
          "description": "",
          "children": []
        }
      ]
    }
  ],
  "warnings": []
}
```

`warnings` is diagnostic only, a dangling item whose target was deleted, an item type Loopress doesn't sync (only `post_type`, `taxonomy`, and `custom` are supported), or an off-environment `custom` URL. It's never part of the tracked configuration and is ignored by `lps menu diff`.

`menu-locations.json` holds `{ "<location>": "<menu slug>" | null }` for every location the active theme registers:

```json
{
  "primary": "main",
  "footer": "footer",
  "social": null
}
```

:::note
Out of scope: legacy menu widgets, multisite, and guessing at an orphaned item whose target slug no longer exists anywhere, that's reported as an explicit error (push) or warning (pull), never a fuzzy match.
:::
