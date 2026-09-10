---
"@loopress/wordpress-plugin": patch
---

Security: the SEO, Forms and ACF sync resources no longer write unvalidated request bodies straight into storage other plugins render (F12, F13).

- New `SyncSanitizer::stripActiveContent()` neutralises script/style blocks, inline event handlers and `javascript:`/`data:text-html` URLs in a string, leaving benign HTML and text byte-for-byte so a pull/edit/push round trip stays stable. Applied recursively to `PUT /seo/settings`, `POST /seo/post-meta`, and every string in an `/acf` import object, all of which are rendered into the public `<head>` or the block editor.
- `POST` / `PUT /forms` no longer overwrites a form's `settings.notifications` / `settings.confirmations` unless the body carries `"allowNotifications": true`. When allowed, recipient addresses are validated with `is_email` and `sender_address` must be on the site's own domain, and message bodies are stripped of active content. New `FormNotificationException` (422). This closes the confirmed notification-hijack: repointing every submission to an attacker inbox with a spoofed sender.
- `POST` / `PUT /seo/redirects` rejects a `urlTo` that points off this site unless the body carries `"allowExternal": true`, and constrains `status` to `active` / `inactive`. New `InvalidRedirectException` (422).
