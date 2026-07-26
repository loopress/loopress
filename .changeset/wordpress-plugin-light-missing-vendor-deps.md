---
"@loopress/wordpress-plugin": patch
---

Fixed a fatal error on every Loopress Light install (`Class "DI\ContainerBuilder" not found`): the Light build shipped an empty Composer `require`, but shared code (`ContainerFactory`, `WpHttpClient`) depends on `php-di/php-di`, `nyholm/psr7`, and `psr/http-client`. The Light build now keeps those, and only excludes the genuinely Full-only packages (`composer/composer`, `sentry/sentry`).
