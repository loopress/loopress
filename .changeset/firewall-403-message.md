---
"@loopress/cli": patch
---

A 403 whose body is not a WordPress JSON error is now reported as a probable firewall or security plugin block (ModSecurity, Imunify360, Wordfence) instead of a credentials failure, in every command and in `lps doctor`. WordPress's own 403s keep the credentials hint.
