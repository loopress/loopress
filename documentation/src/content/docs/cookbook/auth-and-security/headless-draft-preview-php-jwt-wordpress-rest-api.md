---
title: Headless WordPress Draft Preview with Signed JWT Links
description: Preview unpublished WordPress drafts on a Next.js or Astro frontend with short-lived signed JWT links and two REST routes, no admin password shared.
kind: route
---

WordPress is the CMS, a separate frontend renders the site. An editor writes a draft and wants to see it on the real frontend before publishing. The frontend can't: `wp-json/wp/v2/posts/5` answers `401` for a draft to anyone who isn't logged in, which is correct. The usual workarounds are all worse than the problem: an admin Application Password stored in the frontend's environment (every preview request now runs with full admin rights), or drafts made readable by anyone (every unpublished post now leaks to whoever tries ids).

A signed link sits in between. An editor who can already edit the post asks WordPress for a token that says "this one post, for the next 15 minutes". The frontend passes the token back, WordPress checks the signature, and returns that one draft. The frontend never holds a credential, and a leaked link stops working on its own.

## Why this needs a package

The token is a [JWT](https://datatracker.ietf.org/doc/html/rfc7519): a small JSON payload plus an HMAC signature. Signing is a few lines, but verifying one safely is where hand-rolled code goes wrong: comparing signatures in constant time, refusing the `none` algorithm, checking `exp` with clock skew in mind. [`firebase/php-jwt`](https://packagist.org/packages/firebase/php-jwt) does all of it, and its current 7.x releases also refuse an HMAC key too short to be safe.

## The routes

The first route issues a token, for editors only:

```php title="api/preview-link/[post_id].php"
<?php

declare(strict_types=1);

use Firebase\JWT\JWT;

// Issues a signed, 15 minute token for one post. Mirrors the cookbook recipe at
// https://docs.loopress.dev/cookbook/auth-and-security/headless-draft-preview-php-jwt-wordpress-rest-api/.
class PreviewLink
{
    public function post(WP_REST_Request $request): array|WP_Error
    {
        $postId = (int) $request->get_url_params()['post_id'];

        if (get_post($postId) === null) {
            return new WP_Error('not_found', 'No post with that id.', ['status' => 404]);
        }

        // The key is a constant in wp-config.php, or the preview_jwt_secret option. php-jwt 7
        // refuses an HMAC key shorter than 32 bytes.
        $secret = defined('PREVIEW_JWT_SECRET') ? (string) PREVIEW_JWT_SECRET : (string) get_option('preview_jwt_secret');

        if (strlen($secret) < 32) {
            return new WP_Error('no_secret', 'Set PREVIEW_JWT_SECRET or the preview_jwt_secret option (32 characters or more).', ['status' => 500]);
        }

        $token = JWT::encode([
            'sub' => $postId,
            'aud' => 'draft-preview',
            'exp' => time() + 15 * MINUTE_IN_SECONDS,
        ], $secret, 'HS256');

        return [
            'token'      => $token,
            'expires_in' => 15 * MINUTE_IN_SECONDS,
        ];
    }

    public function permission(WP_REST_Request $request): bool
    {
        return current_user_can('edit_post', (int) $request->get_url_params()['post_id']);
    }
}
```

The second one reads a draft, for anyone holding a valid token for that exact post:

```php title="api/preview/[post_id].php"
<?php

declare(strict_types=1);

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Loopress\Api\Attribute\Permission;

// Returns one post, draft or not, to whoever holds a valid token for that exact post.
#[Permission(public: true)]
class Preview
{
    public function get(WP_REST_Request $request): array|WP_Error
    {
        $secret = defined('PREVIEW_JWT_SECRET') ? (string) PREVIEW_JWT_SECRET : (string) get_option('preview_jwt_secret');

        if (strlen($secret) < 32) {
            return new WP_Error('no_secret', 'Preview is not configured.', ['status' => 500]);
        }

        $postId = (int) $request->get_url_params()['post_id'];

        try {
            $claims = JWT::decode((string) $request->get_param('token'), new Key($secret, 'HS256'));
        } catch (Throwable) {
            return new WP_Error('invalid_token', 'Invalid or expired preview token.', ['status' => 401]);
        }

        // The token must be for this purpose and for this very post.
        if (($claims->aud ?? null) !== 'draft-preview' || (int) ($claims->sub ?? 0) !== $postId) {
            return new WP_Error('invalid_token', 'Invalid or expired preview token.', ['status' => 401]);
        }

        $post = get_post($postId);

        if ($post === null) {
            return new WP_Error('not_found', 'No post with that id.', ['status' => 404]);
        }

        return [
            'id'      => $post->ID,
            'status'  => $post->post_status,
            'title'   => get_the_title($post),
            'content' => apply_filters('the_content', $post->post_content),
        ];
    }
}
```

```bash
composer require firebase/php-jwt
lps composer push
lps api push --no-prune
```

`--no-prune` keeps the routes already on the site that are not in your local `api/` directory, a push otherwise [deletes them](/api/cli/). Drop it once `api/` mirrors the whole site.

The signing key is a site secret, never a line of the repo. Define `PREVIEW_JWT_SECRET` in `wp-config.php`, or set the `preview_jwt_secret` option:

```bash
wp option update preview_jwt_secret "$(openssl rand -hex 32)"
```

Both routes refuse to run without one (`500 no_secret`) rather than sign with an empty key, and php-jwt 7 throws `DomainException: Provided key is too short` for an HMAC key under 32 bytes, so the routes check `strlen($secret) < 32` first. Changing the secret invalidates every outstanding preview link at once, which is the behavior you want after a leak.

The `aud` claim pins the token to this one purpose. If the same secret ever signs other tokens elsewhere on the site, one of those can't be replayed here as a preview token.

## Now call it

The editor side, typically a "Preview on the frontend" button in wp-admin, or a CLI call:

```bash
curl -X POST https://your-site.com/wp-json/loopress-api/v1/preview-link/5 \
  -u "editor:xxxx xxxx xxxx xxxx xxxx xxxx"
```

```json
{"token":"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOjUsImF1ZCI6ImRyYWZ0LXByZXZpZXciLCJleHAiOjE3OTAzNzI2ODR9.aIxWJBrBGQe_WR3hs4VCeeiXB_TWEIjDJ3gzvt8K7pQ","expires_in":900}
```

The frontend side, with no credentials at all:

```bash
curl "https://your-site.com/wp-json/loopress-api/v1/preview/5?token=eyJ0eXAiOi..."
```

```json
{"id":5,"status":"draft","title":"Our autumn roadmap","content":"<h2>What ships next</h2>\n<p>A faster editor.</p>\n"}
```

A token with one character changed, one past its 15 minutes, signed with another key, or issued for a different post, answers `401 invalid_token`. Asking for a token without being logged in answers `401`, and as a user who cannot edit that post `403`, both `rest_forbidden`. The frontend's preview page (`/preview?id=5&token=...` in Next.js or Astro) forwards both query parameters, the post id into the path and the token as the `token` query parameter, and renders the result with the same components as a published post.

## Permission

The two routes are deliberately asymmetric. Issuing a token requires `edit_post` on that specific post, so an author can preview their own drafts but not someone else's, exactly like wp-admin's own Preview button. Reading with a token is public, `#[Permission(public: true)]`, because the token *is* the permission: it can only be produced by someone who could already see the draft, it names one post (the route compares the token's `sub` with the id in the URL), and it expires. Loopress warns about every public route when you push it, that warning is expected here.

Keep the token out of logs and analytics where you can: it's a bearer credential for 15 minutes. That's also why the lifetime is short, lengthen it only if editors genuinely need to share a preview for longer.

## A missing package is scoped to this route

Without `firebase/php-jwt` installed, `JWT` and `Key` are undefined classes, an ordinary PHP error on these two requests. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing these routes.

## What this opens up

The same signed-link shape covers anything that should be reachable without an account but not by everyone: a one-time download of a private file, an unsubscribe link, a "confirm your email" step for a headless signup form. The claims change, the two-route structure doesn't.
