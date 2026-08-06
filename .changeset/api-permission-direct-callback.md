---
"@loopress/wordpress-plugin": minor
---

`api/` route files: `permission()` is now called directly by WordPress as the route's `permission_callback` (`permission(WP_REST_Request $request): bool`), instead of being called at registration to produce a callable. **Breaking**: the old `permission(): callable { return fn(): bool => ...; }` form no longer works, update any custom route that overrides `permission()`. A throw inside `permission()` now fails closed (denies that request) instead of skipping the whole route file at boot.

Also logs when an `api/` file has no public HTTP verb method (`get`/`post`/`put`/`patch`/`delete`), previously silent and indistinguishable from a route that intentionally has none yet.
