---
title: "Undo a Bad WordPress Deploy: lps diff and Rollback"
description: "See what a client changed in wp-admin before you push over it, and undo a bad push with lps rollback. The whole safety net, shown on a nav menu."
kind: site
---

Deploying configuration from Git has two ways to go wrong. The first is that the site is no longer what your repository says: a client added a banner link in wp-admin on Tuesday, and your Thursday deploy erases it without a word. The second is that your own push is wrong, a menu loses two links, and you find out from the client. With a database-backed setup you would restore a backup of the whole site and lose a day of orders. Here the part that broke is a file, so the undo can be one command on one resource.

This recipe follows one nav menu through that story, with the real output of each command:

1. push the menu from the repository;
2. someone edits the same menu in wp-admin;
3. `lps diff` shows the outside edit, and the next push refuses to overwrite it;
4. a bad push removes two links;
5. `lps menu rollback` puts them back.

It uses [menus](/menus/) because the damage is visible, but nothing is specific to them: every resource that has a `rollback` command works the same way, see [the list](/rollback/#which-resources-support-it). There is no global rollback, each resource undoes its own push. Only the Loopress plugin is needed, no Composer package.

## The project

```
client-site/
  loopress.json
  menus/
    main.json
    menu-locations.json
```

`menus/main.json` is a menu with three links to pages, written by `lps menu pull` (each item is identified by the page's slug, not its id, see [Menus](/menus/)):

```json title="menus/main.json"
{
  "items": [
    {"children": [], "classes": [], "description": "", "object": "page", "objectSlug": "about", "target": "", "title": "", "type": "post_type", "url": null, "xfn": ""},
    {"children": [], "classes": [], "description": "", "object": "page", "objectSlug": "services", "target": "", "title": "", "type": "post_type", "url": null, "xfn": ""},
    {"children": [], "classes": [], "description": "", "object": "page", "objectSlug": "contact", "target": "", "title": "", "type": "post_type", "url": null, "xfn": ""}
  ],
  "name": "Main Menu",
  "slug": "main",
  "warnings": []
}
```

The file above is shortened to one line per item. The pages `about`, `services` and `contact` must exist on the site: they are content, not part of the project.

## 1. Push

```bash
lps menu push
```

```
Pushing nav menus to http://localhost:8080
Menus path: menus
Found 1 menu to push
❯ Push main.json
› Pushed: main
✔ Push main.json
Pushed: menus/menu-locations.json
All nav menus pushed.
```

Before writing anything, every real push saves a snapshot of what it is about to replace, in `.loopress/snapshots/` on the machine that ran it. Two things use that snapshot: the outside-edit check in step 3, and the rollback in step 5.

## 2. Someone edits the same menu in wp-admin

A client adds a "Summer sale" link under Appearance > Menus. Loopress is not involved, you can reproduce it with WP-CLI:

```bash
wp menu item add-custom main "Summer sale" /sale
```

## 3. `lps diff` shows it before you push

```bash
lps diff --only menu
```

```
Comparing local → local files

Menus
  ~ menu/main
    - items.3: {"children":[],"classes":[],"description":"","object":null,"objectSlug":null,"target":"","title":"Summer sale","type":"custom","url":"/sale","xfn":""}

1 compared: 1 changed, 0 added, 0 removed
Drift detected.
```

A line starting with `-` is on the site and not in your files. The command exits `1` on drift, so the same check can fail a CI job. You do not have to run it first, though: the push itself refuses.

```bash
lps menu push
```

```
Pushing nav menus to http://localhost:8080
Menus path: menus
 ›   Error: Changed on http://localhost:8080 outside Loopress since your last
 ›   push (2026-11-13T22:09:25.531Z), this push would overwrite: menu/main.
 ›   Review with `lps diff --only menu`, bring the site's version into your
 ›   files, or pass --overwrite.
```

You now choose. If the client's link should stay, bring it into the repository with `lps menu pull --yes`, review the change in Git and push. If it should go, pass `--overwrite`. Nothing was lost either way, and nothing was decided for you. See [changes made outside Loopress](/concepts/#changes-made-outside-loopress) for what is and is not detected (a first push from a new clone or from CI has no snapshot to compare with, so it is not checked).

Here the link stays:

```bash
lps menu pull --yes
lps menu push
```

The pull wrote the "Summer sale" item into `menus/main.json`, so the push has nothing to overwrite and goes through. That push also saves a new snapshot: the state of the site with the client's link in it.

## 4. A bad push

Now a mistake of your own. While tidying the menu, a merge drops the Services and Contact links and keeps the rest. `lps diff` shows exactly that before anything is sent:

```bash
lps diff --only menu
```

```
Menus
  ~ menu/main
    ~ items.1.object: "page" → null
    ~ items.1.objectSlug: "services" → null
    ~ items.1.title: "" → "Summer sale"
    ~ items.1.type: "post_type" → "custom"
    ~ items.1.url: null → "/sale"
    - items.2: {"children":[],"classes":[],"description":"","object":"page","objectSlug":"contact","target":"","title":"","type":"post_type","url":null,"xfn":""}
    - items.3: {"children":[],"classes":[],"description":"","object":null,"objectSlug":null,"target":"","title":"Summer sale","type":"custom","url":"/sale","xfn":""}

1 compared: 1 changed, 0 added, 0 removed
Drift detected.
```

`lps menu push --dry-run` gives the same preview without the diff. This time nobody looks, and the push goes through:

```bash
lps menu push
wp menu item list main --fields=title,type
```

```
title	type
about	post_type
Summer sale	custom
```

The site now has two links.

## 5. Roll the resource back

```bash
lps menu rollback --list
```

```
Snapshots for "menu" on "local" (most recent first):
  1794607775411  2026-11-13T22:09:35.411Z
  1794607772331  2026-11-13T22:09:32.331Z
  1794607765531  2026-11-13T22:09:25.531Z
```

The most recent snapshot is the state right before the bad push. Look at what it would change, then do it:

```bash
lps menu rollback --dry-run
lps menu rollback
```

```
Rolling back Menus on http://localhost:8080 to the snapshot from 2026-11-13T22:09:35.411Z (1794607775411)
This would restore Menus to:
  ~ menu/main
    ~ items.1.object: null → "page"
    ~ items.1.objectSlug: null → "services"
    ~ items.1.title: "Summer sale" → ""
    ~ items.1.type: "custom" → "post_type"
    ~ items.1.url: "/sale" → null
    + items.2: {"children":[],"classes":[],"description":"","object":"page","objectSlug":"contact","target":"","title":"","type":"post_type","url":null,"xfn":""}
    + items.3: {"children":[],"classes":[],"description":"","object":null,"objectSlug":null,"target":"","title":"Summer sale","type":"custom","url":"/sale","xfn":""}
Pushing nav menus to http://localhost:8080
...
Rolled back Menus to the snapshot from 2026-11-13T22:09:35.411Z.
```

```
title	type
about	post_type
services	post_type
contact	post_type
Summer sale	custom
```

All three links are back, and so is the client's "Summer sale". The rollback only wrote the menu, it does not touch other resources.

Your local files are not changed by a rollback. Fix `menus/main.json` in Git (`git revert` the bad commit, or `lps menu pull --yes`) before the next push, or you will push the mistake again.

## Good to know

- **If the site changed after the push you are undoing**, the rollback shows the difference and stops: pass `--yes` to roll back anyway. Nothing is overwritten by surprise, in either direction.
- **A rollback creates and updates, it does not delete.** An object created by the push you undo stays, and the command warns about it. Remove it by hand if it should go.
- **Snapshots live on the machine that pushed**, in a folder Git ignores, and the last 10 are kept. A push run in CI saves its snapshot on the runner and loses it with the job: to undo a CI deploy, revert the commit and let the pipeline push again.
- **Run `lps diff` in CI** before the deploy job: it exits `1` on drift, so a pipeline can stop when the site no longer matches the repository. For all resources at once, drop `--only menu`, see [`lps diff`](/workflow/#lps-diff).
- **Every resource has its own rollback.** An ACF field group that broke a form is `lps acf rollback`, a bad role is `lps role rollback`. A deploy that pushed three resources is undone with three commands, see [Rollback and Snapshots](/rollback/).

The role from the [client editor recipe](/cookbook/site-as-code/client-editor-role-wordpress/) keeps clients from breaking the deployed code in the first place, this recipe is for the day something breaks anyway.
