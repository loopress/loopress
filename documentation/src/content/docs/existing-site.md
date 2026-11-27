---
title: Take Over an Existing Site
description: Put a WordPress site built in wp-admin, or one you inherited, under Git. The two blockers to check first, what the connection does to the site, and what the first pull captures.
---

This guide is for a site that already exists and was built by clicking in wp-admin: a client site, an inherited site, one you built before using Git. Nothing on the site has to be restructured and the host stays the same. Two things can stop you, so check them first.

## Check the two blockers

| Blocker | Why it matters | How to check |
|---|---|---|
| PHP older than 8.2 | The plugin needs PHP 8.2+. | **Tools → Site Health → Info → Server** in wp-admin, or ask your host. |
| `DISALLOW_FILE_MODS` set to `true` in `wp-config.php` | WordPress then refuses plugin and theme installs and uploads, and so does Composer. The automatic install of Loopress Full fails, and [Composer](/composer/) packages cannot be installed. | Look for the constant in `wp-config.php`, or wp-admin has no **Add New Plugin** button. |

Without Full you still get [Loopress Light](/wordpress-plugin/#feature-comparison): ACF, forms, menus, custom post types, taxonomies, post meta, roles, options and theme styles. Install Light from the WordPress.org plugin directory, or [upload Full by hand](/wordpress-plugin/#installation) if the host allows uploads another way. If the constant is yours to change, remove it while you set up. If the host sets it, ask them, or work with Light.

## 1. Connect the site

```bash
npm install -g @loopress/cli
lps project config
```

Enter the site's URL, then choose **Authorize in my browser**. WordPress asks you to log in and approve, and creates an [Application Password](/application-passwords/) for the CLI. Nothing goes through a Loopress server, and the credential stays on your machine. On a WordPress older than 7.0 the command falls back to manual entry.

If Loopress Full is not active on the site, the command offers to install it. If you say yes, it creates a temporary administrator account, installs and activates the plugin, then removes the account, even if the install fails. If you say no, the site keeps Loopress Light (or nothing, if no edition was there: install Light from WordPress.org). [Concepts](/concepts/#configuring-an-environment) details both steps.

Name the environment after what it is: an inherited live site is `production`, and pushes to it then ask for confirmation.

## 2. Initialize the repository

```bash
mkdir client-site && cd client-site && git init
lps init
```

`lps init` writes [`loopress.json`](/loopress-json/), tying the repository to the site you just configured.

## 3. Pull what the site already has

```bash
lps pull
git add . && git commit -m "chore: import the existing site"
```

[`lps pull`](/workflow/#lps-pull) writes every resource the site holds as files:

- With Light: ACF field groups, forms, menus, custom post types, taxonomies, post meta keys, roles, options and block theme styles. Options are tracked one by one, see [Options](/options/).
- With Full as well: hooks, API routes, snippets, block patterns, dynamic blocks, apps, plugins and themes, and Composer packages.

A resource the site does not use is skipped.

**What it does not capture.** Posts, pages' content, orders, users and media are not read: they are content, and content is never put in Git. Static pages you write as files and block templates are pushed to a site, never pulled, so a page built in the editor is not in your repository. The repository holds the site's configuration and code, not a copy of the site.

Pull is safe to run on a live site: it only reads from WordPress and only writes local files.

## 4. Work from the repository

From now on the loop is the one from [Getting Started](/getting-started/#4-run-your-first-sync): edit a file, `lps diff`, `lps push`. When the client or an editor changes something in wp-admin, `lps diff` shows it and `lps pull` brings it back.

### Undoing a change made on the site

To put your version back, push it. A push stops before overwriting something changed on the site since your last pull or push, and names it, so you see what you are about to replace. Review the list, then run `lps push --overwrite`. Most pushes can also be [rolled back](/rollback/).

A push is additive: it creates and updates, and it does not delete by default. Something the client created in wp-admin, a menu or an ACF field group for example, stays on the site after your push. To remove it, delete it in wp-admin, or pull it into your files first and remove it explicitly. See [push never deletes by default](/concepts/#push-never-deletes-by-default).

## Next steps

- [Concepts](/concepts/): environments, `--env`, dry runs
- [Multi-Environment Workflow](/workflow/): clone production to a staging site and compare
- [CI/CD Integration](/ci/): deploy from a pipeline
