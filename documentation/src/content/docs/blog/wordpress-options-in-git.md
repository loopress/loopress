---
title: The wp_options Rows Your Site Depends On Belong in Git
description: Plugin settings, the front page, the date format. The wp_options rows that shape a WordPress site are invisible to Git. Loopress lets you track the ones that matter, one by one, and refuses the ones that shouldn't travel.
date: 2026-10-22
draft: true
cliVersion: 0.26.0
wordpressPluginVersion: 2026.11.0
authors:
  - maxime
tags:
  - options
  - configuration
  - environments
  - wordpress
excerpt: Half of a WordPress site's behaviour lives in wp_options, set through settings screens nobody reviews. Track the rows you care about as JSON files, and let Loopress refuse the ones that would break a site if copied.
---

Every plugin you install asks for settings, and every one of those settings screens ends in a `wp_options` row. The cookie banner's wording, the caching plugin's exclusions, the permalink base for products, the site's date format. Change one on staging, and production only gets it if someone remembers to click through the same screen, the same way.

The usual workaround is a database sync, which drags content along with it. The other usual workaround is a line in a Notion page that says "don't forget to set X on prod".

## Why not just sync all of wp_options

Because `wp_options` is not configuration. It's a drawer everything gets thrown into: settings, yes, but also caches, transients, cron schedules, license keys, API secrets, and the site's own URL. Copy the whole table from staging to production and production starts redirecting to staging.

So Loopress tracks nothing by default. You pick options one at a time.

## Pick, then track

Start by finding the name. `lps option list` shows option names and their autoload flag, never values:

```bash
lps option list --no-core
```

`--no-core` hides WordPress's own options, and each remaining one carries a best-effort guess of the plugin that owns it. When you've found the one you want:

```bash
lps option add wpseo_titles
```

That reads the option from the site and writes it as a file, which is what "tracked" means:

```json title="options/wpseo_titles.json"
{
  "autoload": "on",
  "name": "wpseo_titles",
  "readonly": false,
  "value": {"separator": "sc-dash", "title-home-wpseo": "%%sitename%%"}
}
```

From there it's the same loop as everything else in your repo:

```bash
lps option pull                     # refresh every tracked option from the site
git diff options/                   # see what someone changed in wp-admin
lps option push --env staging       # write tracked options to another environment
```

`option push` creates and updates, it never deletes an option you don't track. Options are also part of `lps push`, `lps pull`, and `lps diff`, so a drift check covers them for free.

## Options that shouldn't travel

Some options are worth watching but must never be copied. `siteurl` and `home` hold the site's own address: push staging's values to production and production points at staging. `rewrite_rules` and `cron` are computed state, not settings.

These get `"readonly": true` automatically when you track them, and `option push` skips them. You still see them in `lps option diff`, which is exactly what you want: "production's home URL is not what I expect" is worth knowing, overwriting it never is. `readonly` is a plain field in the file, so you can set it on any option you want to watch without ever pushing it.

## What the plugin refuses, whatever your files say

A local flag is a convenience. The real limits are enforced by the Loopress plugin on the site, so a hand-edited file or a script can't get around them:

- **Secret-looking options can't be read.** A name containing `secret`, `password`, `token`, `nonce`, `salt`, or `credential`, or ending in `_key` or `_pass`, among others. A payment gateway's API key shouldn't end up in a Git repo because someone tracked the wrong option. It's a name-based safeguard, not a guarantee, so track only what you need.
- **Options that change who can do what can't be written.** `default_role`, `users_can_register`, `siteurl`, `home`, and a few others. Nobody should be able to open registration with an administrator default role through a JSON file.
- **Options owned by another command are off-limits.** `active_plugins` belongs to `lps plugin`, `stylesheet` and `template` to `lps theme`.
- **Serialized PHP objects are refused.** They can't round-trip through JSON without losing information, so Loopress refuses them rather than corrupting them.

Each refusal comes back with the plugin's own explanation. Both lists can be relaxed for one specific name with a WordPress filter, `loopress_option_readable` or `loopress_option_writable`, when you've decided a given option is safe.

## One trap no tool can catch for you

An option value is copied as-is. If it contains a post id, a term id, or a user id, that id means something else on the other environment. `page_on_front` is the classic case: it stores the id of the page shown as the homepage, and on production that id is probably a different page. Before tracking an option, glance at its value. If it's full of numbers that look like ids, it's per-environment data, not configuration: track it `readonly`, or leave it out.

## Concurrent edits don't get overwritten

A settings screen and a deploy can collide: an editor saves the plugin's settings on production while your push is running. `option push` reads each option's current value right before writing it, and the plugin refuses the write if it changed in between. The push fails for that option instead of silently erasing the editor's save. Pull, look, push again.

---

```bash
npm install -g @loopress/cli
```

Option tracking works with both Loopress Light and Loopress Full. The [Options reference](/options/) has the full list of readonly and refused names.
