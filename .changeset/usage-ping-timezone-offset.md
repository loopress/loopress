---
"@loopress/wordpress-plugin": patch
---

The usage ping now sends the site's UTC offset (for example `+02:00`) when no city is picked under Settings → General, instead of an empty timezone. WordPress defaults to an offset, so most sites sent nothing.
