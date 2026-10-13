---
"@loopress/wordpress-plugin": patch
---

Admin page redesign:

- Every block of every tab now sits in its own white card, so all tabs share one look. Recent pushes on Overview is a table, Settings groups both data-sharing toggles in one card, and Dependencies stacks "Add a package" above "Installed packages" (the table no longer overflows its card).
- Overview now repeats every issue the other tabs raise: server configuration, Composer platform problems, security advisories and abandoned packages, code files that failed to load, and Loopress declarations skipped because something registered the same slug first.
- Code tab: "View source" on API routes and hooks opens the file in a drawer on the right, with a copy button, instead of expanding it inline, with PHP syntax colors.
- Config tab: Loopress-owned post types, taxonomies, roles and meta keys stand out in the Source column. When ACF or a form plugin isn't installed, its section shows a quiet note instead of a red error, and the admin page no longer retries requests the server refused with a 4xx.
- The page header no longer slides under the WordPress admin bar when scrolling.
- The API routes namespace moves from under the routes list to the Settings tab, and to a gear popover in the API routes card header.
- A **Check for updates** button in the page header asks GitHub right away instead of waiting for the twice-daily check, and offers the update when there is one. Dashboard → Updates' **Check again** now really asks GitHub too.
