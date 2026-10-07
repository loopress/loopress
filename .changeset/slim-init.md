---
"@loopress/cli": patch
---

`lps init` no longer asks for a snippets directory or a list of feature directories. It writes only `projectId` and `rootDir`, every resource uses its default directory, and a custom name is a `<kind>Dir` key in `loopress.json`. The suggested next step is now `lps pull`.
