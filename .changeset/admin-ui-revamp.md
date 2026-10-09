---
"@loopress/wordpress-plugin": minor
---

The Loopress admin page is reorganized into three tabs: Dependencies, Code (API routes, hooks and single-page apps, read-only) and Settings. The site's environment type now shows next to the title, and on a production site installing, updating or removing a Composer package asks for a confirmation first. `DISALLOW_FILE_MODS` is now respected: Composer dependencies become read-only in the admin, and every Composer endpoint that writes files answers 403, `lps composer push` included. Platform and webserver checks moved out of the removed Diagnostics tab into Tools > Site Health, and only show on the Dependencies tab when they find something. The Code tab adds a source view and a copyable URL for each API route, a copyable shortcode for each app, and when each named cron runs next. The update banner is gone, since updates already appear on the Plugins page.
