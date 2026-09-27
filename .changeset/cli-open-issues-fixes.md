---
"@loopress/cli": patch
---

`lps promote <from> <to> --dry-run` now previews what `<from>` would really push: it pulls `<from>` into a throwaway copy of the project and dry-runs the push from there, instead of previewing your current local files. App password auto-rotation is skipped in CI (the runner can't persist the new password, so rotating would revoke the one stored in the CI secret), with a warning to run `lps project rotate` where the config lives. A 403 with an empty body now shows the underlying error instead of ending on a bare colon.
