---
"@loopress/wordpress-plugin": minor
"@loopress/cli": minor
---

Makes `api push` and `hook push` atomic (#236). Previously, `pushFile()` sent one independent HTTP PUT per file: a push of N files that failed partway through (network error, a stale `expectedRevision`, a class collision, a syntax error on file K) left files `1..K-1` already live on the site and `K..N` untouched, a mixed state discoverable only after the fact via `lps diff`.

`AbstractFilesDirectory` gains a batch staging API (`beginBatch`/`stageWrite`/`stageDelete`/`commitBatch`/`abortBatch`): a batch stages into an inactive sibling directory seeded with a copy of every currently live file, and `commitBatch()` swaps it into place with a directory `rename()`, atomic on the filesystems WordPress actually runs on. `AbstractFilesController` gains a `POST {routePath}/batch` endpoint that validates and stages every file (and every `--prune`d filename) of one push, and only calls `commitBatch()` once every single one has succeeded; any failure aborts the batch and leaves the live directory completely untouched.

`api push`/`hook push` now send one batch request instead of N sequential PUTs, folding `--prune` into the same atomic swap rather than a separate round of DELETEs after the fact. The single-file `PUT`/`DELETE` endpoints are unchanged, still used by `lps <resource> rm` and any direct API integration.
