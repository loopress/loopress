---
"@loopress/wordpress-plugin": minor
---

Add Composer-backed plugin/theme installs (Loopress Full only). `POST /loopress/v1/composer/sync` takes `{ intent, lock, force }`, renders a plugin-owned `composer.json` from the intent (libraries + WPackagist plugins/themes), runs Composer against the WPackagist repository, and returns the effective `composer.json`, `composer.lock`, and the list of removed packages. It returns 422 (`unmanaged_plugins_present`) when the intent references a plugin/theme folder installed by hand, unless `force` is set. `LoopressEnvironment` scaffolds and migrates the site `composer.json` with the WPackagist repository, `composer/installers`, and the installer-paths that place plugins/themes under `wp-content/`.
