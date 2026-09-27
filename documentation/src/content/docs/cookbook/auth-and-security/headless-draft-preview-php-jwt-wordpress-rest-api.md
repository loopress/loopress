---
title: Signed Draft Previews for a Headless WordPress Frontend with firebase/php-jwt
description: Two Custom API Routes that let a headless frontend (Next.js, Astro) show an unpublished draft through a short-lived signed link, using firebase/php-jwt, without giving the frontend a WordPress password.
kind: route
draft: true
---

WordPress is the CMS, a separate frontend renders the site. An editor writes a draft and wants to see it on the real frontend before publishing. The frontend can't: `wp-json/wp/v2/posts/488` answers `401` for a draft to anyone who isn't logged in, which is correct. The usual workarounds are all worse than the problem: an admin Application Password stored in the frontend's environment (every preview request now runs with full admin rights), or drafts made readable by anyone (every unpublished post now leaks to whoever tries ids).

A signed link sits in between. An editor who can already edit the post asks WordPress for a token that says "this one post, for the next 15 minutes". The frontend passes the token back, WordPress checks the signature, and returns that one draft. The frontend never holds a credential, and a leaked link stops working on its own.

## Why this needs a package

The token is a [JWT](https://datatracker.ietf.org/doc/html/rfc7519): a small JSON payload plus an HMAC signature. Signing is a few lines, but verifying one safely is where hand-rolled code goes wrong: comparing signatures in constant time, refusing the `none` algorithm, checking `exp` with clock skew in mind. [`firebase/php-jwt`](https://packagist.org/packages/firebase/php-jwt) does all of it, and its current 7.x releases also refuse an HMAC key too short to be safe.

## The routes

The first route issues a token, for editors only:

```php title="api/preview-link/[post_id].php"
<?php

declare(strict_types=1);

use Firebase\JWT\JWT;

class PreviewLink
{
    public function post(WP_REST_Request $request): array
    {
        $postId = (int) $request->get_param('post_id');

        $token = JWT::encode([
            'sub' => $postId,
            'aud' => 'draft-preview',
            'exp' => time() + 15 * MINUTE_IN_SECONDS,
        ], wp_salt('auth'), 'HS256');

        return [
            'token'      => $token,
            'expires_in' => 15 * MINUTE_IN_SECONDS,
        ];
    }

    public function permission(WP_REST_Request $request): bool
    {
        return current_user_can('edit_post', (int) $request->get_param('post_id'));
    }
}
```

The second one reads a draft, for anyone holding a valid token:

```php title="api/preview.php"
<?php

declare(strict_types=1);

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Loopress\Api\Attribute\Permission;

#[Permission(public: true)]
class Preview
{
    public function get(WP_REST_Request $request): array|WP_Error
    {
        try {
            $claims = JWT::decode((string) $request->get_param('token'), new Key(wp_salt('auth'), 'HS256'));
        } catch (Throwable) {
            return new WP_Error('invalid_token', 'Invalid or expired preview token.', ['status' => 401]);
        }

        if (($claims->aud ?? null) !== 'draft-preview') {
            return new WP_Error('invalid_token', 'Invalid or expired preview token.', ['status' => 401]);
        }

        $post = get_post((int) $claims->sub);

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
```

The signing key is `wp_salt('auth')`, derived from the `AUTH_KEY` and `AUTH_SALT` constants every `wp-config.php` already has. There's no new secret to store, it never leaves the server, and it's 64 characters by default, comfortably above the 32 bytes php-jwt 7 requires for HS256 (a shorter key throws `DomainException: Provided key is too short`). Rotating the salts in `wp-config.php` invalidates every outstanding preview link at once, which is the behavior you want after a leak.

The `aud` claim pins the token to this one purpose. If the same salt ever signs other tokens elsewhere on the site, one of those can't be replayed here as a preview token.

## Now call it

The editor side, typically a "Preview on the frontend" button in wp-admin, or a CLI call:

```bash
curl -X POST https://your-site.com/wp-json/loopress-api/v1/preview-link/488 \
  -u "editor:xxxx xxxx xxxx xxxx xxxx xxxx"
```

```json
{"token":"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOjQ4OCwiYXVkIjoiZHJhZnQtcHJldmlldyIsImV4cCI6MTc5MDM3MjY4NH0.aIxWJBrBGQe_WR3hs4VCeeiXB_TWEIjDJ3gzvt8K7pQ","expires_in":900}
```

The frontend side, with no credentials at all:

```bash
curl "https://your-site.com/wp-json/loopress-api/v1/preview?token=eyJ0eXAiOi..."
```

```json
{"id":488,"status":"draft","title":"Our autumn roadmap","content":"<h2>What ships next</h2>\n<p>A <strong>faster</strong> editor.</p>\n"}
```

A token with one character changed, or one past its 15 minutes, answers `401 invalid_token`. The frontend's preview page (`/preview?token=...` in Next.js or Astro) just forwards the query parameter and renders the result with the same components as a published post.

## Permission

The two routes are deliberately asymmetric. Issuing a token requires `edit_post` on that specific post, so an author can preview their own drafts but not someone else's, exactly like wp-admin's own Preview button. Reading with a token is public, `#[Permission(public: true)]`, because the token *is* the permission: it can only be produced by someone who could already see the draft, it names one post, and it expires. Loopress warns about every public route when you push it, that warning is expected here.

Keep the token out of logs and analytics where you can: it's a bearer credential for 15 minutes. That's also why the lifetime is short, lengthen it only if editors genuinely need to share a preview for longer.

## A missing package is scoped to this route

Without `firebase/php-jwt` installed, `JWT` and `Key` are undefined classes, an ordinary PHP error on these two requests. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing these routes.

## What this opens up

The same signed-link shape covers anything that should be reachable without an account but not by everyone: a one-time download of a private file, an unsubscribe link, a "confirm your email" step for a headless signup form. The claims change, the two-route structure doesn't.
