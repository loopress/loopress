---
title: Why WordPress Menus Break When You Move Them Between Sites
description: A WordPress menu item points at a post id, and ids never match between staging and production. Loopress syncs menus by slug instead, so a menu built on staging arrives on production pointing at the right pages.
date: 2026-10-15
draft: true
cliVersion: 0.26.0
wordpressPluginVersion: 2026.11.0
authors:
  - maxime
tags:
  - menus
  - environments
  - staging
  - wordpress
excerpt: Export a menu from staging, import it on production, and half the links point at the wrong pages. Not a bug in your import tool, a property of how WordPress stores menus. Here's how to sync them by identity instead.
---

You rebuild the main navigation on staging: a new Services dropdown, three pages moved around, a link to the docs. It looks right. Now it has to get to production.

The options are all bad. Rebuild it by hand in Appearance > Menus and hope you click the same things in the same order. Use an export/import plugin and discover that "About" now links to a 2019 blog post. Or sync the whole database and wipe production's orders along the way.

The import plugin isn't broken. It's faithfully copying something that was never portable.

## A menu item is a pointer to an id

Under the hood, a WordPress menu item is a `nav_menu_item` post with a few meta fields. For a link to a page, the important one is `_menu_item_object_id`: the id of the page it points to.

Ids are auto-increment database values. The About page is post `42` on staging because of the order things were created there. On production, created in a different order, it's `118`, and `42` is some unrelated post, or nothing at all. Copy the menu as-is and every item points wherever `42` happens to land on the target site.

## Sync by identity, not by id

`lps menu pull` writes each menu as a JSON file, and for every item that points at a post or a term, it stores *what* it points at instead of the id: the post type or taxonomy, plus the target's slug.

```json title="menus/main.json"
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

"The page whose slug is `about`" means the same thing on every environment. On push, Loopress looks up that slug on the target site and builds the menu item with whatever id it has *there*.

Two more details make the file reviewable. Items are nested as a tree, children under their parent, instead of a flat list of parent ids, so reordering a dropdown shows up in `git diff` as what it is. And menus are matched by their own slug, so pushing `main.json` twice updates the Main Menu instead of creating a second one.

## Refusing to guess

The interesting case is when the target doesn't exist. Your staging menu links to a new `/pricing/` page that hasn't been created on production yet.

A tool that guesses would drop the item silently, or link it to nothing. `lps menu push` fails that menu, before writing anything to it, and tells you which item couldn't be resolved. A menu is rebuilt as one unit on push, never half-updated, so production keeps its current menu until the pricing page exists. Create the page (or push it as a [static page](/pages/)), then push the menu again.

Custom links get a softer treatment: an absolute URL pointing at a different domain than the target site gets a warning, not a failure. Menus legitimately link off-site, but a hard-coded `https://staging.example.com/contact/` in a production menu is almost always a mistake worth a second look.

## Menu locations come along

Which menu sits in "Primary Navigation" and which in "Footer" is a separate setting, and a per-theme one. It's pulled into its own file:

```json title="menus/menu-locations.json"
{
  "primary": "main",
  "footer": "footer",
  "social": null
}
```

`lps menu push` applies it to whichever theme is active on the target, again by menu slug.

## The workflow

```bash
lps menu pull --env staging     # the menus you built on staging, as files
git diff menus/                 # review exactly what changed
git commit -am "nav: add Services dropdown"
lps menu diff --env production  # what production has right now vs. the files
lps menu push --env production --yes
```

`--yes` is there because pushing to an environment named `production` asks for confirmation, and a CI job can't answer a prompt. If the push was a mistake, `lps menu rollback` restores the menus as they were right before it.

---

```bash
npm install -g @loopress/cli
```

Menu sync works with both Loopress Light and Loopress Full. The [Menus reference](/menus/) covers every flag and the full file format.
