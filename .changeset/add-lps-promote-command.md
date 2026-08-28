---
"@loopress/cli": minor
---

Add `lps promote <from> <to>`, which copies every tracked resource from one environment to another by running `lps pull` from `<from>` then `lps push` to `<to>` in one step. It confirms once up front (local tracked files are overwritten with `<from>` in the process, and the prompt calls out production targets), forwards `--dry-run` to both halves, and stops before pushing if the pull fails.
