---
"@loopress/wordpress-plugin": patch
---

Loopress Full now initializes the Sentry PHP SDK on boot, reporting PHP errors and exceptions from the plugin's own code so they can be triaged across every install. Filtered via a `before_send` callback that only keeps events whose stack trace passes through this plugin's own files, so a site's Sentry project never fills up with errors from its theme or other plugins. Loopress Light doesn't have this: `src/Sentry/` is stripped at build time like the other Full-only features. Currently a scaffold pending the real Sentry project DSN, an unset DSN is a documented no-op for the SDK, so this ships inert until then.
