---
"@loopress/wordpress-plugin": patch
---

Menus and SEO meta now find child pages. A menu item pointing to `account/profile` used to fail on push with `No "page" post with slug "profile" was found`, and SEO meta for a child page did too. `lps menu pull` now writes a child page's full path (`account/profile`), so menu files pulled before this change get a one-time diff. A bare slug still works when exactly one page has it; when several do (`account/profile` and `team/profile`), the push fails with a 409 listing the paths to choose from.
