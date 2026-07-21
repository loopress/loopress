---
"@loopress/wordpress-plugin": patch
---

Loopress Full now checks GitHub for newer releases and shows an admin notice ("Loopress Full X is available, you are running Y") with a link to the release when one exists. Read-only for now: no download or install, you still update manually via loopress.dev, same as before. Backed by a new `GET loopress/v1/update` endpoint. Loopress Light doesn't have this: WordPress.org reserves update-checking for its own review-and-update flow, so it stays out of that edition.
