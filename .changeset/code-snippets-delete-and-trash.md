---
"@loopress/wordpress-plugin": patch
---

Fix two bugs in the Code Snippets provider: `deleteSnippet()` was missing the leading slash required by `WP_REST_Server::dispatch()`, so `DELETE /wp-json/loopress/v1/snippets/{id}` always failed with "Snippet not found" instead of deleting anything. Separately, `getSnippets()`/`getSnippet()` returned trashed snippets indistinguishably from active ones (Code Snippets' own REST API doesn't filter them out), causing `lps snippet pull` to re-import a snippet the user had just deleted from wp-admin.
