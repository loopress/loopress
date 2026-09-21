---
"@loopress/wordpress-plugin": patch
---

Fixes a fatal error in `lps snippet list`/`pull`/`push` whenever the Code Snippets plugin is active. `CodeSnippetsSnippetProvider` called `Snippet::is_trashed()`, a method the current WPackagist release of Code Snippets (3.10.2) no longer has: trash state is exposed as the `trashed` property on `Code_Snippets\Model\Snippet` instead. Both call sites (`isTrashed()` and `trashedIds()`) now read the property, and the static-analysis stub is updated to match the real class.
