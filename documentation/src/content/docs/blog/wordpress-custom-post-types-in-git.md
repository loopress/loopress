---
title: Your WordPress Custom Post Types Belong in Git, Too
description: A custom post type is a schema, not content. Two ways to keep one version-controlled and deployed with the Loopress CLI, ACF's JSON export or register_post_type() in a hook file, and how to pick between them.
date: 2026-09-26
draft: true
cliVersion: 0.26.0
wordpressPluginVersion: 2026.11.0
authors:
  - maxime
tags:
  - custom post types
  - acf
  - hooks
  - git
  - wordpress
excerpt: Tickets, events, speakers, case studies. Every serious WordPress site grows its own content types, and on most of them the definition lives in a database row nobody can diff. It doesn't have to.
---

Every WordPress site that does more than blog ends up with its own content types: tickets, events, speakers, case studies, job offers. The content inside them belongs in the database. The definition of the type itself, its name, its labels, whether it's public, which fields it supports, does not. It's a schema. Code depends on it: a route that looks up `get_post($id)->post_type === 'ticket'` breaks the day someone renames the type in an admin screen on production and not on staging.

On most sites that schema lives in one of three places: a plugin's settings screen (CPT UI, ACF), a `register_post_type()` call pasted into `functions.php`, or a snippets plugin. None of them gives you a diff, a review, or a guarantee that staging and production agree.

Loopress gives you two ways out. Both are plain files in Git, both deploy with one CLI command.

## Path 1: ACF post types, as JSON

If the site already uses [ACF](https://www.advancedcustomfields.com/) (or the free Secure Custom Fields fork), its post types are exportable objects like its field groups. Create the type in the ACF admin once, then pull it:

```bash
lps acf pull --type post-types
```

```text
acf/
  post-types/
    post_type_speaker.json
```

The file is ACF's own export format, untouched: `post_type`, `labels`, `public`, `supports`, `rewrite`, and the rest. Commit it, and from then on it's reviewed like code and deployed like code:

```bash
lps acf push
```

The same push carries the field groups attached to that type, so the type and its fields always arrive together. Each object is identified by its stable `key`, so pushing twice updates rather than duplicates. See the [ACF command reference](/acf/) for every flag.

## Path 2: `register_post_type()`, in a hook file

Without ACF, a post type is one WordPress function call on `init`. With [Loopress Full](/wordpress-plugin/), that call lives in a [hook file](/hooks/) instead of `functions.php`:

```php title="hooks/ticket-post-type.php"
<?php

declare(strict_types=1);

use Loopress\Hooks\Attribute\Action;

class TicketPostType
{
    #[Action('init')]
    public function register(): void
    {
        register_post_type('ticket', [
            'labels'       => [
                'name'          => 'Tickets',
                'singular_name' => 'Ticket',
                'add_new_item'  => 'Add Ticket',
                'search_items'  => 'Search Tickets',
            ],
            'public'       => false,
            'show_ui'      => true,
            'show_in_rest' => true,
            'menu_icon'    => 'dashicons-tickets-alt',
            'supports'     => ['title'],
        ]);
    }
}
```

```bash
lps hook push
```

The Tickets menu appears in wp-admin on the next page load. It's the exact code the WordPress handbook tells you to write, just not tied to the active theme, and not hidden in a database-stored snippet.

One detail the labels array above exists for: `register_post_type()` with only `'label' => 'Tickets'` still shows "Add Post" and "Search Posts" in the admin, because WordPress doesn't derive the other labels from the name. Spell out the ones your editors will actually see.

## The permalink gotcha, and which path has it

A **public** post type registered in code has one well-known trap: its pretty URLs return 404 until WordPress regenerates its rewrite rules. We checked both paths on the same site, `/%postname%/` permalinks, a freshly created entry:

| Path | Entry URL right after the first push |
|------|------|
| `register_post_type()` in a hook (`/event/headless-meetup-4/`) | 404, then 200 once the rewrite rules are regenerated |
| ACF post type via `lps acf push` (`/speaker/ada-lovelace/`) | 200 straight away |

ACF regenerates rewrite rules itself when it saves a post type, including one arriving through `lps acf push`. A hook file is just code running on `init`, it never triggers that. So after pushing a hook that registers a new public type (or changes its slug), open Settings > Permalinks and click Save once per environment. A non-public type, like the tickets above, has no front-end URL and no such step.

## Which one to pick

- **The site already runs ACF, and non-developers adjust the type** (a label, a menu icon, an extra taxonomy): the ACF path. Editors keep their screen, you `lps acf pull` their change, review it, and push it everywhere else.
- **No ACF, or the type is something code depends on** (a route looks it up, a hook fires on its `save_post`): the hook path. Nobody changes it from an admin screen by accident, and it sits in the same repo as the code that relies on it.
- **Both in one project is fine**, as long as a given type has one owner. Registering the same `post_type` from ACF and from a hook means two definitions racing on `init`.

Post types defined in the CPT UI plugin are the one case neither path covers today: CPT UI stores them in a single option, not as exportable objects. Moving such a type to one of the two paths above is a one-time copy of its settings.

## What this looks like in a real project

The [ticket QR code recipe](https://github.com/loopress/demo/tree/main/qr-code-generation-wordpress-rest-api) in our demo repo uses the hook path: `hooks/ticket-post-type.php` defines the type, `api/ticket-qr/[ticket_id].php` is a [custom API route](/api/routes/) that only answers for posts of that type, and CI pushes them in that order:

```bash
lps composer push && lps hook push && lps api push
```

The type, the code that depends on it, and the order they deploy in are all in one diff. That's the point.

---

```bash
npm install -g @loopress/cli
```

ACF sync works with Loopress Light and Full. Hook files and custom API routes are [Loopress Full](/wordpress-plugin/) features.
