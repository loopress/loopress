---
"@loopress/wordpress-plugin": patch
---

`full-width: true` now reaches the true edge on Twenty Twenty-Five's page template: the side padding of the template's own wrappers around the content (`<main>` and its group) is dropped too, on any block theme. The header and footer keep theirs, and the template's vertical spacing is unchanged.
