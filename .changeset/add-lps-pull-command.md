---
"@loopress/cli": minor
---

Add `lps pull`, a top-level command that pulls plugins, composer dependencies, ACF, API routes, forms, pages, SEO, and snippets from WordPress in one run instead of calling each resource's `pull` command separately. It's the counterpart of `lps push`. `composer` is pulled before `plugins` so plugin detection sees the fresh `composer.json`, and `--yes` is forwarded only to the resource pulls that prompt before deleting orphaned local files.
