---
"@loopress/cli": minor
"@loopress/wordpress-plugin": minor
---

Options that store a page ID (EDD's checkout pages in `edd_settings`, WooCommerce's `woocommerce_shop_page_id`...) can now be synced between environments. Declare them in the option file with `"refs": {"purchase_page": "page"}`, then `lps option pull` writes the page's path instead of its ID, and `lps option push` turns it back into the ID of that page on the target. A page missing on the target fails the push for that option with a clear message.
