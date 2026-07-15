---
"@loopress/wordpress-plugin": patch
---

Fixed a WordPress Plugin Check text domain mismatch on both editions: the source carried `loopress`, a leftover text domain from before the light/full split that matches neither edition's real slug. `scripts/build-flavor.cjs` now rewrites the `Text Domain` header and translation calls to `loopress-light` / `loopress-full` per edition at build time. Also realigned both `readme.txt` changelogs with `CHANGELOG.md`, the source of truth: they had drifted with fabricated `2026.8.0` and `2026.6.0` entries that don't exist in the real release history.
