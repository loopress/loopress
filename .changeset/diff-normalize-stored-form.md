---
"@loopress/cli": patch
"@loopress/mcp": patch
"@loopress/wordpress-plugin": patch
---

`lps diff`, push dry runs and the outside-edit check no longer report drift on ACF field groups or Global Styles that are in sync. ACF stores every setting with its default (`wrapper`, `aria-label`...), which a hand- or agent-written field group leaves out: the local files are now compared as the site would store them, through a new read-only plugin route (`POST loopress/v1/acf/normalize/<type>`) that runs them through ACF's own validation without saving anything. Global Styles now compare a preset list and its origin-keyed form (`palette: [...]` and `palette: {custom: [...]}`) as the same, and a `var:preset|color|base` reference as its `var(--wp--preset--color--base)` expansion, the two forms WordPress rewrites on save. With a plugin older than this release, ACF files are compared as written, as before. If the site can't be read for the outside-edit check after an earlier push, the push now stops instead of skipping the check.
