---
"@loopress/cli": patch
---

Single-resource commands (`lps hook push`, `lps acf list`, `lps block pull`, ...) now read the site capabilities first. On a site that can't hold the resource, such as hooks on Loopress Light, they print the same "Not supported by this site" message as `lps push`, with how to fix it, instead of a raw 404.
