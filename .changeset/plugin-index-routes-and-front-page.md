---
"@loopress/wordpress-plugin": minor
---

A nested `api/orders/index.php` is now the `/orders` route instead of being silently ignored after a successful push. A root `api/index.php` is refused at push time (it's the directory's anti-listing guard, and `/` is the namespace discovery index), and two files resolving to the same route (`orders.php` and `orders/index.php`) are refused at push, or skipped and reported by `lps api list` when deployed another way. Pushing a published `pages/home.html` now makes it the site's front page (Settings > Reading), replacing the previous one; switching it back to draft reverts the site to its latest posts.
