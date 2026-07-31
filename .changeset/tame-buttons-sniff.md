---
"@loopress/cli": patch
---

Bug fixes from the QA backlog (5th pass), lot 1:

- `lps doctor` and `lps project config` now detect Application Passwords being disabled on the target site by reading the `wp-json/` index instead of probing `wp-admin/authorize-application.php`, which sits behind the admin login wall and never reached the check that would report the feature disabled.
- `lps page push` can now recreate a page whose local id no longer exists on the site (deleted, or pushed to a site where that id never existed): the fallback create no longer sends the stale id, which WordPress core previously rejected with "Cannot create existing post".
- Server error messages are no longer hidden on a 404: a legitimate applicative 404 from a Loopress controller (e.g. `lps composer pull` on a site with no `composer.lock` pushed yet) now shows the real server message instead of a generic "is the plugin installed?" one, and `lps composer pull` treats that specific case as "no lock yet" and writes `composer.json` alone instead of failing.
