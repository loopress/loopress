---
title: Issuing a Short-Lived JWT from a WordPress Route for Another Service
description: A Custom API Route that turns a logged-in WordPress session into a short-lived JWT, so a separate backend can trust the identity without touching WordPress itself, using firebase/php-jwt.
kind: route
draft: true
---

A headless frontend has a logged-in WordPress user (cookie auth, the normal admin-facing session) and needs to call a separate service, a support chat backend, a recommendation API, something that isn't WordPress and shouldn't need to be. That service has no reason to understand WordPress cookies or nonces, and handing it an administrator's application password just to identify "this is user 482" is both the wrong credential and too much access for what's needed.

## Why this needs a package

A JSON Web Token is the standard shape for this: a signed, self-contained claim ("this is user 482, issued at this time, expires in five minutes") that the other service can verify on its own, using a secret it shares with WordPress, without ever calling back to it. Building the signature correctly, base64url-encoding each part, HMAC-signing the header and payload together, comparing in constant time on verification, is exactly the kind of narrow cryptographic detail worth using a maintained implementation for rather than a hand-rolled one. [`firebase/php-jwt`](https://packagist.org/packages/firebase/php-jwt) is the standard PHP one, small, focused, no wider framework attached.

## The route

```php title="api/session-token.php"
<?php

declare(strict_types=1);

use Firebase\JWT\JWT;

class SessionToken
{
    public function post(): array
    {
        $now = time();

        $token = JWT::encode([
            'iss' => home_url(),
            'sub' => get_current_user_id(),
            'iat' => $now,
            'exp' => $now + 300, // five minutes: just long enough to hand off to the other service
        ], (string) get_option('session_token_secret'), 'HS256');

        return ['token' => $token, 'expires_in' => 300];
    }

    public function permission(): bool
    {
        return is_user_logged_in();
    }
}
```

```bash
composer require firebase/php-jwt
lps composer push
```

The other service verifies the token itself, `Firebase\JWT\JWT::decode($token, new Key($secret, 'HS256'))` if it's also PHP, an equivalent JWT library if it isn't, using the same secret configured out of band. Nothing in this route needs to know what the other service does with the claim, and nothing in the other service needs to call back to WordPress to check it.

## Now call it

```bash
curl -X POST https://your-site.com/wp-json/loopress-api/v1/session-token \
  -u "admin:xxxx xxxx xxxx xxxx xxxx xxxx"
```

```json
{"token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...", "expires_in": 300}
```

The caller authenticates as a logged-in user the same way any [application password](/application-passwords/)-protected route does, `is_user_logged_in()` doesn't care which credential proved it, only that a session exists.

## Permission, and why the expiry matters more than usual here

`is_user_logged_in()` gates who can request a token, the same as any other route. What deserves more attention is the five-minute expiry: a JWT is a bearer credential with no built-in revocation, once issued, it's valid until it expires, full stop, there's no equivalent of deleting a session row. Keeping the lifetime short is the only lever this design has against a leaked token, five minutes is enough to hand off to the other service, not enough to matter much if it leaks in a log somewhere. A route issuing longer-lived tokens needs an actual revocation story, a token allowlist or a version claim checked against the user, not just a longer `exp`.

## A missing package fails the one request, not the site

Without `firebase/php-jwt` installed, `JWT::encode()` is an undefined method on an undefined class, an ordinary PHP error scoped to this request. Loopress doesn't catch that on your behalf, it only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, before any route loads, not one missing package inside an intact one. Install the package through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

The same shape covers any case where WordPress is the identity source but not the system doing the work, a webhook relay, an internal admin tool, a background job service. It's also a small, single-purpose file, one claim built, one encode call, that's a reasonable one to have an AI coding assistant draft, the expiry value above being exactly the kind of line worth a human setting deliberately rather than trusting a first pass on.
