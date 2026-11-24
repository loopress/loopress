---
"@loopress/cli": minor
---

`lps eject` now also turns API routes (`api/`), shared classes (`lib/`) and the Composer libraries of `composer.json` into the generated plugin: each route is registered with `register_rest_route()` under the same namespace and paths, with the same permission rules, `lib/` keeps its `LoopressLib\` autoloader, and the libraries are listed in the plugin's own `composer.json` (run `composer install --no-dev` in the plugin folder before zipping it). Apps and dynamic blocks are still refused, with the list.
