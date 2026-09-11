---
"@loopress/mcp": patch
---

Security: the mutating-tool confirm handshake now applies from a frozen copy of the working tree, not a fresh disk read (F28).

The two-call handshake bound the `confirmToken` to the CLI arguments, but the apply step re-read the files from disk, up to 5 minutes after the preview the caller approved. A file swapped in that window (a benign `snippets/foo.php` for a web shell) was pushed under an approval given against the old content.

The preview call now copies the working directory to a temp dir (skipping `node_modules`, `.git`, `vendor`, `dist`), runs the dry-run against that copy, and the apply runs from the same copy. The snapshot is removed after the apply and on token expiry or eviction. Known gap, documented: an `lps --path` outside the working directory, or a `loopress.json` that maps a resource directory to an absolute path elsewhere, is still read live.
