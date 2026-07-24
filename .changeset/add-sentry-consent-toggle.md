---
"@loopress/wordpress-plugin": patch
---

Loopress Full's Sentry error reporting is now opt-in. Until an admin decides either way, a banner ("Send crash reports to Loopress?") shows on every tab of the admin page with Allow/Deny buttons; once decided, a switch in the new Settings tab reflects and lets you change the choice. The Sentry PHP SDK's global handlers don't install at all until consent is given. Backed by `GET`/`PUT loopress/v1/sentry/consent`, storing the choice in a WordPress option. A new "Reset all settings to default" button (`DELETE loopress/v1/settings`, global to all Loopress settings, not just Sentry) clears it and brings the banner back. Existing installs upgrading into this send nothing until an admin opts in.
