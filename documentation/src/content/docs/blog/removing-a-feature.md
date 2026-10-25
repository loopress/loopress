---
title: Sometimes Building a Product Means Removing a Feature
description: Loopress had an SEO module that synced Rank Math and Yoast data through Git. It worked, it was tested, it was on the homepage. I removed it, because it broke the one rule the product is built on.
date: 2026-10-24
draft: false
authors:
  - maxime
tags:
  - product
  - story
  - configuration
  - wordpress
excerpt: The SEO module worked, had tests, and was a headline feature of Loopress Light. Then I looked at what it actually put in Git on a real site, and almost none of it was configuration.
---

Loopress has one rule: it versions configuration, never content. Field groups, menus, post types, options, code. Not posts, not pages, not the things editors type into wp-admin every day.

For months, one module broke that rule, and I didn't notice, because it worked.

## The SEO module

`lps seo pull` read everything Rank Math or Yoast stored and wrote it as JSON: the site-wide title templates, every post's SEO meta, every redirect. `lps seo push` sent it back. It had a diff, a rollback, unit tests, an end-to-end suite running against both plugins, and a guard refusing to run when both plugins were active at once. It was in the first sentence of the Loopress Light listing on WordPress.org and on the homepage.

By every metric I usually look at, it was a finished feature. I just never really used it in production myself.

## The module that made me look

Later, with more time spent in the WordPress ecosystem, I started to see how much of WordPress core fits Loopress's rule as it is: options, menus, post types, taxonomies, all configuration, none of it needing a third-party plugin. Options came first. The option module, `lps option add <name>`, tracks a single `wp_options` row as a file in Git. Its docs needed a realistic example, and the first one that came to mind was `wpseo_titles`, Yoast's settings row.

That's when it clicked. One of the SEO module's jobs had just become a one-liner of another command. So I went to check what the rest of it was doing.

## What it actually put in Git

I opened the `seo/` folder of the site Loopress was born on, my sister's French tutoring site, and read it file by file instead of trusting the green checkmarks.

80 files of per-post meta. In all 80, a `rank_math_internal_links_processed` flag: an internal marker Rank Math sets for itself. In 72, a `rank_math_seo_score`: a number Rank Math computes. In 71, a `rank_math_analytic_object_id`: a row id in one database, which means nothing on another environment, and pushing it there quietly breaks the link. Robots directives stored as serialized PHP strings.

What a human had actually written: 4 descriptions, 1 title, 9 focus keywords. And all of it belonged to a post, which makes it content, edited by whoever edits that post.

27 redirect files, each carrying a hit counter and two timestamps, so every pull produced a diff nobody had caused, and every push could overwrite live counters on production. Targets were absolute production URLs. Every 410 became a file named after its database row id, `N-redirect.json`.

And one `settings.json`: the title templates and schema defaults. Real configuration, finally. It was one row in `wp_options`, exactly what the [option module](/options/) now tracks. So the only part of the SEO module that respected the rule was a duplicate of the newer command:

```bash
lps option add rank-math-options-titles   # Rank Math
lps option add wpseo_titles               # Yoast SEO
```

Everything else was content dressed up as configuration, plus the code needed to make that look safe: an adapter per SEO plugin, raw SQL against Rank Math's redirect table, a check that redirect targets stay on the site, active-content stripping on every string. Each of those existed because the module was doing something Loopress shouldn't do in the first place.

## What removing it cost

It wasn't free, and pretending otherwise would be dishonest.

- **A headline feature.** The WordPress.org listing, the homepage and the comparison pages all said "SEO". Now they don't.
- **Redirect versioning.** Some people will want it. It's still content: redirects are created by editors in wp-admin, and they belong to the site, not the repository.
- **Projects already using it.** `lps seo` is gone since 0.30.0. Migrating is one command: track the option above, then delete `seo/`.

What it gave back: close to 5,000 lines of code, tests and docs deleted, all in [one pull request](https://github.com/loopress/loopress/pull/307). A plugin that no longer reads or writes another plugin's database tables. One less thing to explain on the homepage. And a rule that is true again, with no "except SEO" footnote.

## The part I want to remember

Nothing was broken. No bug report, no failing test, no angry user. A feature that is clearly wrong gets removed eventually. A feature that works, is tested, and doesn't fit the product's rule can stay forever, because it never gives you a reason to look at it.

And I wasn't using it in production myself, so nothing in my own day-to-day was going to surface it either. What finally got me to look was a newer feature overlapping it, and then opening the real files on a real site. Not the fixtures, not the tests: the folder a user would actually commit. If most of what's in there wasn't written by a person, it isn't configuration, and it doesn't belong in Git.

Building the feature took weeks. Deciding to delete it took an afternoon of reading JSON. I should have done that afternoon first.

---

Tracking SEO plugin settings is covered in the [Options reference](/options/#seo-plugin-settings).
