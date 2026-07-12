---
"@loopress/cli": minor
---

Replaced `lps project sync` with `lps project push` and `lps project pull`, matching the `push`/`pull` naming used by `snippet`, `plugin` and `composer`. `lps project push` creates/links local projects and environments on your Loopress account and pushes credentials (what `sync` did for local-to-remote). `lps project pull` fetches projects and environments already on your account that aren't configured locally yet, now works even when no project is configured locally.
