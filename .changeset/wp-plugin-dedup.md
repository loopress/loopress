---
"@loopress/wordpress-plugin": patch
---

Internal refactor: deduplicated REST error-response handling (`AcfController`, part of `ComposerController`), the filesystem bootstrap snippets shared by `ApiDirectory`/`AppsDirectory`/`LoopressEnvironment`, `composer.lock`/JSON-output parsing in `ComposerService`, and the "exactly one active provider" arbitration duplicated identically across the SEO/Snippets/Forms services. No behavior change.
