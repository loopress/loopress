---
"@loopress/cli": minor
---

`lps init` no longer asks for a snippet provider. Most projects never use snippets, and the question came before any choice about them. To use snippets on a site that has neither Code Snippets nor WPCode, run `lps plugin add code-snippets` (or `insert-headers-and-footers` for WPCode).
