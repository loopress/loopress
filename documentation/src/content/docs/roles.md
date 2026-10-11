---
title: Roles
description: Declare custom WordPress user roles and their capabilities as JSON files in Git, the same on every environment.
edition: light
---

The `role` command group declares custom WordPress user roles in code: a "Client editor" that can edit pages but not plugins, a "Shop manager" for a store. Each role is one JSON file holding its name and its capabilities, and the Loopress plugin adds it on every request, so the role is identical on local, staging and production.

Only the role itself is versioned. Which users have it is content, set in wp-admin, and Loopress never pulls or pushes it.

A `roles/` file is data, never PHP, so roles work with both editions of the plugin, Loopress Light included.

## Typical workflow

```bash
# 1. Declare a role
mkdir -p roles && cat > roles/client-editor.json <<'EOF'
{
  "name": "Client editor",
  "capabilities": {
    "read": true,
    "edit_pages": true,
    "edit_published_pages": true,
    "publish_pages": true,
    "upload_files": true
  }
}
EOF

# 2. Commit it
git add roles/ && git commit -m "feat: add a client editor role"

# 3. Deploy it to WordPress
lps role push
```

"Client editor" now appears in the role dropdown of Users > Add New.

## Commands

Every command below also accepts the [common flags](/concepts/#common-flags): `--env`, `--json`, and `--yes` where it applies. They work exactly like their [`lps cpt`](/custom-post-types/#commands) counterparts.

| Command | What it does |
|---------|--------------|
| `lps role push [path]` | Create or update each role from `roles/*.json`. Never deletes a role, never changes which users have it. Refused if the role changed on WordPress since it was last read. |
| `lps role pull [path]` | Write the roles Loopress manages to `roles/<slug>.json`. Built-in roles and roles created by a plugin are never pulled. Local files no longer on WordPress are removed, see [pull mirrors the site](/concepts/#pull-mirrors-the-site). |
| `lps role list` | Every role on the site, where it comes from (Loopress, WordPress, a plugin) and how many users have it. |
| `lps role rm <slug>` | Stop registering a Loopress role. Its users keep it in their profile, with no capability until it's pushed again. The local file is left alone. Asks for confirmation, `--yes` skips it. |
| `lps role diff [path]` | What differs between `roles/` and an environment, or two environments with `--against`. Also part of [`lps diff`](/workflow/#lps-diff) (`--only role`). |
| `lps role rollback` | Restore the snapshot saved before an earlier push, see [Rollback and Snapshots](/rollback/). |

**Example `lps role list` output:**

```
administrator (Administrator): WordPress, 2 users
editor (Editor): WordPress, 5 users
client-editor (Client editor): Loopress, 3 users
shop_manager (Shop manager): theme or plugin, 1 user
```

## File format

```
roles/
  client-editor.json
```

The file name is the role's slug: 1 to 50 lowercase letters, digits, `_` or `-`. WordPress's built-in roles (`administrator`, `editor`, `author`, `contributor`, `subscriber`) and any `wp_` slug are reserved.

| Key | Required | Value |
|-----|----------|-------|
| `name` | Yes | The name shown in wp-admin |
| `capabilities` | No | An object mapping each capability to `true` (granted) or `false` (explicitly denied). Leave it out for a role with no capability. |

There is no inheritance: list every capability the role needs. WordPress documents the capabilities of each built-in role in [Roles and Capabilities](https://wordpress.org/documentation/article/roles-and-capabilities/), a good starting point to copy from. `lps validate` checks all of this before you push.

## How the role is stored

Loopress adds the role in memory on every request, it never writes it into WordPress's saved roles (the `wp_user_roles` option). Two consequences:

- **The file is the only source of truth.** Changes made to a Loopress role from a role editor plugin (Members, User Role Editor) are not kept. Change the file and push instead.
- **`lps role rm` really removes it.** Nothing is left behind in the database apart from the users' assignment.

A role with the same slug already saved on the site, created by hand or by a plugin, wins: the Loopress version is skipped, never overwritten, and shows a **Conflict** badge.

## In wp-admin

The **Config** tab of the Loopress admin page lists every role on the site, read-only: name, slug, source and number of users.
