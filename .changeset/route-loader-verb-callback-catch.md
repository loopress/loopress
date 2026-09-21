---
"@loopress/wordpress-plugin": patch
---

Wraps route verb callbacks (`get()`, `post()`, etc.) in a try/catch so an uncaught exception returns a clean 500 response instead of fataling the request. WP core's own dispatch (`WP_REST_Server::respond_to_request()`) has no try/catch around the route callback, unlike `permission_callback` and `headers()`, which `RouteLoader` already wrapped for the same reason.
