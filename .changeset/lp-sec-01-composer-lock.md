---
"@loopress/wordpress-plugin": patch
---

Security: `POST /loopress/v1/composer/sync` no longer installs from a client-supplied `composer.lock`.

The endpoint used to write the uploaded `lock` to disk verbatim and run `composer install`, which replayed it as-is: a crafted lock could point `dist.url` / `source.url` at attacker-controlled hosts (server-side request forgery) and regenerate `vendor/composer/autoload_files.php` from those archives, which the plugin then loads on every request (remote code execution). The lock is now advisory only. Composer always runs `update` and resolves the plugin-rendered `composer.json` against its own Packagist and WPackagist repositories; the uploaded lock is only parsed afterwards to report which resolved versions moved (`lockDrift` in the sync response).

Also: every Composer invocation now passes `--no-scripts`, and the `lock` sync argument is capped at 5 MB.
