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

Two things tie everything together:

| Element | Rule | Example |
|---------|------|---------|
| Filename | Lowercase kebab-case path segments (letters, digits, hyphens), optionally nested in subdirectories, `.php` extension | `hello-world.php` |
| Route | The path without extension, under the [namespace](#the-route-namespace) | `/loopress-api/v1/hello-world` |

**The class can be named anything.** There's no filename-to-class-name formula to get right: the plugin reads the file to find out what class it declares (via PHP's own tokenizer, never by executing the file), so `HelloWorld`, `Handler`, or anything else all work identically. The one rule that matters: **exactly one class per file**. Zero classes, or more than one, is rejected.

Several structural requirements are enforced at push time, with a clear error if any fails:

- The file must contain `declare(strict_types=1);` exactly once. More than once (even inside a comment) or zero times is rejected.
- The file must declare exactly one class. `lps api push` rejects zero or several immediately, before anything is written; put code shared between several route files in [`lib/`](#sharing-code-between-route-files-and-snippets) instead of a second class in the same file.
- The class name must not already be taken by another `api/` file, WordPress core, or another active plugin. `lps api push` checks all three and rejects the push immediately if any collide.
- Every path segment must match the kebab-case pattern, or be a dynamic segment (see below). The CLI checks this before uploading, so a bad filename fails with an explicit message instead of a network error.

## Dynamic path segments

A segment wrapped in brackets, `[order_id]`, matches anything in that position and passes it through as a request param. The name inside the brackets follows PHP identifier rules (must start with a letter or underscore, since it becomes a named capture group internally), the same charset `$request->get_param()` needs anyway:

```php
<?php

declare(strict_types=1);

// api/invoice-pdf/[order_id].php

class InvoicePdf
{
    public function get(WP_REST_Request $request): array
    {
        return ['order_id' => $request->get_param('order_id')];
    }
}
```

Answers at `/loopress-api/v1/invoice-pdf/482`, `/loopress-api/v1/invoice-pdf/anything-else`, and so on, `order_id` available through `$request->get_param('order_id')` exactly like a query param. A route can have more than one dynamic segment, nested at any depth: `api/orders/[order_id]/items/[item_id].php` gives both `order_id` and `item_id`, class named however you like, same as any other route file.

There's no catch-all segment (no `[...path]`): every segment, dynamic or not, is explicit and named. A route always has a fixed, predictable number of segments.

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

### Different permissions per verb, with `#[Permission]`

`permission()` applies to every verb in the file. When a file needs a different check per verb, for instance a public `get()` next to an admin-only `post()`, use the `#[Permission]` attribute instead, on a verb method or on the class:

```php
use Loopress\Api\Attribute\Permission;

class Item
{
    #[Permission(public: true)]
    public function get(): array
    {
        return ['items' => get_option('my_items', [])];
    }

    #[Permission(capability: 'edit_posts')]
    public function post(WP_REST_Request $request): array
    {
        // ...
    }
}
```

A `#[Permission]` on the class applies to every verb that doesn't have its own, a `#[Permission]` on a verb method overrides it for that verb only. Resolution order, most specific first: attribute on the verb, attribute on the class, the file's `permission()` method, the closed `manage_options` default.

`callback` points to the actual check instead of a fixed capability, either a local method name or a shared static method for logic reused across several route files:

```php
#[Permission(callback: 'checkSignature')]
public function post(WP_REST_Request $request): array { /* ... */ }

public function checkSignature(WP_REST_Request $request): bool
{
    return hash_equals((string) get_option('my_webhook_secret'), (string) $request->get_header('x-webhook-secret'));
}
```

```php
#[Permission(callback: [SharedChecks::class, 'requireApiKey'])] // SharedChecks::requireApiKey must be static
class Webhook { /* ... */ }
```

Same fail-closed behavior as `permission()`: a throwing `callback` denies the request and logs the error instead of breaking the site.

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

### Sharing code between route files (and snippets)

`wp-content/loopress/lib/` is for code reused across several route files, permission checks, formatters, anything that isn't a route itself. Classes there are autoloaded under the `LoopressLib\` namespace, the same `use`-and-go behavior as a Composer dependency:

```php
// wp-content/loopress/lib/SharedChecks.php
<?php

declare(strict_types=1);

namespace LoopressLib;

use WP_REST_Request;

final class SharedChecks
{
    public static function requireApiKey(WP_REST_Request $request): bool
    {
        return hash_equals((string) get_option('my_api_key'), (string) $request->get_param('api_key'));
    }
}
```

```php
use Loopress\Api\Attribute\Permission;
use LoopressLib\SharedChecks;

#[Permission(callback: [SharedChecks::class, 'requireApiKey'])]
class Webhook { /* ... */ }
```

`lib/` is never scanned for routes, it's a plain autoload target, not another `api/`. In a [code snippet](/composer/using-in-snippets/), where the autoloader isn't loaded automatically, `require_once` the Composer autoloader first, the same one step already needed there for any Composer dependency.

## Failure isolation

A single bad route file can never take down the site or the rest of its REST API. Each file is loaded independently, and any of these problems skip **that file only**, with a line in the PHP error log prefixed `Loopress api/:` explaining why:

- A parse error or fatal error while loading the file
- A file that doesn't declare exactly one class (zero, or more than one)
- A class name that is already taken by WordPress core, another plugin, or another route file
- A `permission()` method that throws

Every other route file keeps working, and so does everything else on the site.

A skipped file also shows up as a warning in the plugin's **API Routes** admin tab (see [Admin UI](/api/admin-ui/)), with the same reason as the error log, so you don't have to go looking for it there. The warning clears itself the next time the file loads cleanly, nothing to dismiss manually.

Most of these never make it that far: `lps api push` rejects the same problems immediately, before anything is written, so they surface as a CLI error at push time instead of a log line discovered later:

- **Invalid PHP syntax**: a server-side `php -l` check on each file. On hosts where it can't run (no PHP CLI binary, `exec` disabled), the push goes through and a broken file is caught by the isolation above instead.
- **Zero or more than one class declared.**
- **A class name collision**, checked against WordPress core, every other active plugin, and every other `api/` file already on the site.

## Where files live on the server

Pushed files are stored in `wp-content/loopress/api/`, one `{filename}.php` per route. Details that matter operationally:

- **Direct access is blocked.** `wp-content/` is publicly reachable over HTTP, so on push the plugin injects a standard `ABSPATH` guard right after the `declare` line. A direct browser request to the file exits immediately; the code only runs through the REST API. The guard is stripped again when the CLI pulls or lists files, so your local copies stay exactly as you wrote them.
- **Directory listing is blocked** by an empty `index.php`.
- **Writes are atomic.** Files are written to a temp file and renamed, so a REST request arriving mid-push never loads a half-written file.

You never need to touch this directory: the CLI is the only intended writer, and [`lps api pull`](/api/cli/) reconstructs your local directory from it at any time.
