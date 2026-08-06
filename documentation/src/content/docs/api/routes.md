---
title: Writing Route Files
description: The complete reference for custom API route files, request handling, responses, authentication, CORS, namespaces, and the security model.
---

:::note
Custom API Routes are a [Loopress Full](/wordpress-plugin/) feature, not available in Loopress Light.
:::

A route file is a plain PHP file in your project's `api/` directory. Deployed with [`lps api push`](/api/cli/), each file becomes one REST route on the site. This page is the complete reference for what a route file can do.

:::tip
Since these files call WordPress functions from a repo where WordPress isn't installed, set up [WordPress stubs](/editor-setup/) once to get autocomplete and static analysis in your editor.
:::

## Anatomy of a route file

```php
<?php

declare(strict_types=1);

class HelloWorld
{
    public function get(): array
    {
        return ['message' => 'Hello, world!'];
    }
}
```

Saved as `api/hello-world.php` and pushed, this file answers at:

```
https://example.com/wp-json/loopress-api/v1/hello-world
```

Three naming rules tie everything together:

| Element | Rule | Example |
|---------|------|---------|
| Filename | Lowercase kebab-case: letters, digits, hyphens only, `.php` extension | `hello-world.php` |
| Class | The filename converted to PascalCase | `HelloWorld` |
| Route | The filename without extension, under the [namespace](#the-route-namespace) | `/loopress-api/v1/hello-world` |

Two structural requirements are enforced at push time, with a clear error if either fails:

- The file must contain `declare(strict_types=1);` exactly once. More than once (even inside a comment) or zero times is rejected.
- The filename must match the kebab-case pattern. The CLI checks this before uploading, so a bad filename fails with an explicit message instead of a network error.

## HTTP verbs

The class exposes one public method per HTTP verb it handles:

| Method | HTTP verb |
|--------|-----------|
| `get()` | GET |
| `post()` | POST |
| `put()` | PUT |
| `patch()` | PATCH |
| `delete()` | DELETE |

Only the verbs implemented as **public** methods are registered. A private or protected method is ignored, and every unimplemented verb is left off the route entirely, so WordPress answers it with its standard "no route" error.

One file can serve several verbs:

```php
<?php

declare(strict_types=1);

class Item
{
    public function get(): array
    {
        return ['items' => get_option('my_items', [])];
    }

    public function post(WP_REST_Request $request): array
    {
        $items   = get_option('my_items', []);
        $items[] = sanitize_text_field($request->get_param('name'));
        update_option('my_items', $items);

        return ['items' => $items];
    }
}
```

## Handling the request

Each verb method receives the standard [`WP_REST_Request`](https://developer.wordpress.org/reference/classes/wp_rest_request/) object as its first argument. Declare the parameter if you need it, omit it if you don't, both signatures work:

```php
public function get(): array                        // no request data needed
public function post(WP_REST_Request $request): array  // reads params or body
```

Everything `WP_REST_Request` offers is available:

```php
public function post(WP_REST_Request $request): array
{
    $id     = $request->get_param('id');        // query string or body, merged
    $body   = $request->get_json_params();      // decoded JSON body
    $header = $request->get_header('x-signature');

    return ['received' => $id];
}
```

## Responses

Return values go through WordPress's standard REST serialization, so all the usual shapes work:

| Return | Result |
|--------|--------|
| `array` | JSON-encoded, status 200 |
| `WP_REST_Response` | Full control over status code and headers |
| `WP_Error` | JSON error body, with the status from the error data |

```php
public function post(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $name = $request->get_param('name');

    if (!is_string($name) || $name === '') {
        return new WP_Error('missing_name', 'The name parameter is required.', ['status' => 400]);
    }

    return new WP_REST_Response(['created' => $name], 201);
}
```

## Authentication and permissions

By default, every route is **closed**: it requires an authenticated user with the `manage_options` capability, the same check the Loopress management endpoints use. Two ways to satisfy it:

- An [application password](/application-passwords/) for an administrator account, via HTTP Basic auth (what the CLI itself uses)
- A logged-in admin session with a REST nonce (requests from the WordPress admin)

To change who can call a route, add a public `permission(WP_REST_Request $request): bool` method. It replaces the default check for every verb in the file, and is called directly by WordPress when the route is dispatched, so it can inspect headers, params, or anything else on the request:

```php
// Public route, no authentication
public function permission(WP_REST_Request $request): bool
{
    return true;
}
```

```php
// Any logged-in user
public function permission(WP_REST_Request $request): bool
{
    return is_user_logged_in();
}
```

```php
// A shared secret in a header, e.g. for a webhook
public function permission(WP_REST_Request $request): bool
{
    return hash_equals((string) get_option('my_webhook_secret'), (string) $request->get_header('x-webhook-secret'));
}
```

Returning `false` produces WordPress's standard `rest_forbidden` response.

Defensive behavior, so a mistake never breaks the site: if `permission()` throws, the request it was checking is denied (fails closed, same as returning `false`) and the error is logged. The route itself stays registered and keeps working for every other request, only the request that hit the throw is affected.

## Response headers and CORS

Two ways to set headers, depending on whether they vary per verb or apply to the whole route.

### Per-verb headers

Return a `WP_REST_Response` and call `header()` on it. This is the right place for anything that depends on the specific request, a cache directive that varies with the resource, a content-disposition on a download, and so on:

```php
public function get(WP_REST_Request $request): WP_REST_Response
{
    $response = new WP_REST_Response(['order_id' => $request->get_param('order_id')]);
    $response->header('Cache-Control', 'private, max-age=60');

    return $response;
}
```

### Route-wide headers, including the OPTIONS preflight

Add a public `headers()` method returning a map of header name to value. The headers are sent on **every** request to the route, including the `OPTIONS` preflight that WordPress answers automatically without ever calling your verb methods, which is exactly what browser CORS needs, and exactly what a per-verb `WP_REST_Response` can't reach:

```php
public function headers(): array
{
    return [
        'Access-Control-Allow-Origin'  => 'https://app.example.com',
        'Access-Control-Allow-Methods' => 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers' => 'Content-Type, Authorization',
    ];
}
```

Only string-to-string pairs are applied, anything else in the array is ignored. If `headers()` throws, the error is logged and the request is served without the custom headers, it never breaks the response itself.

### Don't set the same header name in both places

`headers()` is applied after your verb method runs, so if the same header name appears in both a `WP_REST_Response` and `headers()`, `headers()` silently wins, even if the `WP_REST_Response` value was the more specific one. Keep the two non-overlapping: `WP_REST_Response` for whatever varies by verb or request, `headers()` strictly for what must apply route-wide, CORS being the main case.

## The route namespace

Routes register under the `loopress-api/v1` namespace by default:

```
/wp-json/loopress-api/v1/{filename}
```

The namespace is configurable from the plugin's **Settings** tab (see [Admin UI](/api/admin-ui/#route-namespace)). The rules:

- Format: lowercase letters, digits, and hyphens, followed by a version segment, e.g. `acme/v1` or `my-agency/v2`. Anything else is rejected.
- `loopress/v1` is reserved for Loopress's own management endpoints and cannot be chosen.
- Changing it changes every route's URL on the next request, with no redirect from the old URL. Update your consumers first.

## Using your own Composer dependencies

If the site also uses [Composer](/composer/) to manage site-wide PHP dependencies, those packages are available to `use` in your route files directly, no manual `require` needed (unlike in [code snippets](/composer/using-in-snippets/), where you still load the autoloader yourself):

```php
<?php

declare(strict_types=1);

use GuzzleHttp\Client;

class Webhook
{
    public function post(): array
    {
        $client = new Client();
        // ...
        return ['ok' => true];
    }
}
```

A broken dependency install (missing package, corrupted autoloader) is logged and skipped the same way a broken route file is, it never breaks the rest of the site's REST API.

## Failure isolation

A single bad route file can never take down the site or the rest of its REST API. Each file is loaded independently, and any of these problems skip **that file only**, with a line in the PHP error log prefixed `Loopress api/:` explaining why:

- A parse error or fatal error while loading the file
- A file that loads but doesn't declare the expected class
- A class name that is already taken by WordPress core, another plugin, or another route file
- A `permission()` method that throws

Every other route file keeps working, and so does everything else on the site.

Most syntax errors never make it that far: `lps api push` runs a server-side syntax check on each file and rejects invalid PHP with the parse error message before anything is written. On hosts where the check can't run (no PHP CLI binary, `exec` disabled), the push goes through and a broken file is caught by the isolation above instead.

## Where files live on the server

Pushed files are stored in `wp-content/loopress/api/`, one `{filename}.php` per route. Details that matter operationally:

- **Direct access is blocked.** `wp-content/` is publicly reachable over HTTP, so on push the plugin injects a standard `ABSPATH` guard right after the `declare` line. A direct browser request to the file exits immediately; the code only runs through the REST API. The guard is stripped again when the CLI pulls or lists files, so your local copies stay exactly as you wrote them.
- **Directory listing is blocked** by an empty `index.php`.
- **Writes are atomic.** Files are written to a temp file and renamed, so a REST request arriving mid-push never loads a half-written file.

You never need to touch this directory: the CLI is the only intended writer, and [`lps api pull`](/api/cli/) reconstructs your local directory from it at any time.
