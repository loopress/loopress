---
"@loopress/wordpress-plugin": patch
---

Fixed a performance issue where every request to the site (not just REST API ones) required and reflected every `api/*.php` route file just to check for a `#[Cron]` method. A cheap pre-check now skips that work entirely for files that don't mention `Cron`.
