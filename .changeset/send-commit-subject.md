---
"@loopress/cli": minor
---

`lps push` and every `*:push` command now send the subject line of the current Git commit with the deployment record, so the console can show readable text for each push. No commit subject is sent outside a Git repository.
