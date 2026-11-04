---
"@loopress/cli": patch
---

`lps push` now skips every resource the project has no local directory for ("not configured, skipped"), instead of running it on an empty directory and sending a request to the site for each: post types, taxonomies, post meta, roles, menus, options, API routes, hooks, dynamic blocks, patterns and pages. On Loopress Light, a Full-only resource the project does use is still refused upfront.
