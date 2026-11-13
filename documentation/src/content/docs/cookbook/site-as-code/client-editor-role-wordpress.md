---
title: "WordPress Client Editor Role in Git: Safe Custom Role"
description: "Give a client a WordPress role that can write and publish but not touch plugins, themes or settings, declared as a JSON file in Git with lps role push."
kind: site
---

You hand a site over to a client. They need to publish news, fix a typo on the opening hours page and upload photos. They do not need the Plugins screen, and one wrong click there (deactivating the cache plugin, updating a plugin on a Friday evening) breaks something you deployed from code. WordPress's built-in **Editor** role is close but not enough: it cannot manage plugins, but it also carries powers a client rarely needs (links, private content, raw HTML), and the usual fix when you want something tighter is a role editor plugin whose settings live in the database, invisible to Git and different on every environment.

This recipe declares the role as one file in your repository, with the Loopress plugin as the only plugin and no Composer package:

- a `client-editor` [role](/roles/) that writes and publishes posts and pages, uploads media and moderates comments;
- an explicit `false` for every capability that changes what is deployed: plugins, themes, theme options and settings.

## The project

```
client-site/
  loopress.json
  roles/
    client-editor.json
```

## The role

```json title="roles/client-editor.json"
{
  "name": "Client editor",
  "capabilities": {
    "read": true,
    "upload_files": true,
    "edit_posts": true,
    "edit_published_posts": true,
    "edit_others_posts": true,
    "publish_posts": true,
    "delete_posts": true,
    "delete_published_posts": true,
    "edit_pages": true,
    "edit_published_pages": true,
    "edit_others_pages": true,
    "publish_pages": true,
    "delete_pages": true,
    "delete_published_pages": true,
    "manage_categories": true,
    "moderate_comments": true,
    "install_plugins": false,
    "activate_plugins": false,
    "update_plugins": false,
    "delete_plugins": false,
    "edit_plugins": false,
    "switch_themes": false,
    "install_themes": false,
    "edit_themes": false,
    "edit_theme_options": false,
    "manage_options": false
  }
}
```

A role has no inheritance: it is exactly the list above. A capability left out is refused anyway, the `false` entries are there to say it in the file, so a reviewer reading a pull request sees that the omission is on purpose. `manage_options` is the one that matters most: it guards the Settings screens and the `/wp/v2/settings` endpoint, and many plugins reuse it for their own settings page.

Push it:

```bash
lps role push
```

```
Found 1 role to push
❯ Push client-editor
› Pushed: client-editor
✔ Push client-editor
All roles pushed.
```

`lps role list` now shows it next to the built-in roles:

```
administrator (Administrator): WordPress, 1 user
editor (Editor): WordPress, 0 users
author (Author): WordPress, 0 users
contributor (Contributor): WordPress, 0 users
subscriber (Subscriber): WordPress, 0 users
client-editor (Client editor): Loopress, 0 users
```

## Give it to a user

Only the role is in Git. Who has it is content, set in wp-admin (Users > Add New) or with WP-CLI:

```bash
wp user create acme-client client@example.com --role=client-editor
```

## What the client can and cannot do

Logged in as that user, a post publishes straight away:

```bash
curl -u "acme-client:<application password>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Spring opening hours","content":"We open at 9.","status":"publish"}' \
  "https://example.com/?rest_route=/wp/v2/posts"
# {"id":11,"date":"2026-11-13T21:07:20", ... "status":"publish" ...}
```

The same user asking for the plugin list, or changing a site setting, is refused:

```bash
curl -u "acme-client:<application password>" "https://example.com/?rest_route=/wp/v2/plugins"
# {"code":"rest_cannot_view_plugins","message":"Sorry, you are not allowed to manage plugins for this site.","data":{"status":403}}

curl -u "acme-client:<application password>" -H "Content-Type: application/json" \
  -d '{"title":"x"}' "https://example.com/?rest_route=/wp/v2/settings"
# {"code":"rest_forbidden","message":"Sorry, you are not allowed to do that.","data":{"status":403}}
```

In wp-admin, `post-new.php` and `upload.php` open, while `plugins.php`, `plugin-install.php`, `themes.php` and `options-general.php` answer `403 Forbidden` with "Sorry, you are not allowed to access this page."

## Good to know

- **The file wins.** Loopress adds the role on every request and never saves it into the database, so a role editor plugin cannot loosen it behind your back: change the file and push, see [how the role is stored](/roles/#how-the-role-is-stored).
- **Plugins can add their own screens.** A plugin whose settings page asks for `edit_posts` instead of `manage_options` stays reachable by this role. Check the plugins you ship, and add a `false` for any custom capability they define.
- **Test it as the client.** The point of the role is what it refuses, so log in as a user that has it once after each change to the file, as the [demo project's test](https://github.com/loopress/demo/tree/main/client-editor-role-wordpress) does.
- **Rollback.** A bad push of the role is undone with `lps role rollback`, see [Rollback and Snapshots](/rollback/).

To see how the rest of a site is declared the same way, start with the [events catalog](/cookbook/site-as-code/upcoming-events-custom-post-type-wordpress-rest-api/).
