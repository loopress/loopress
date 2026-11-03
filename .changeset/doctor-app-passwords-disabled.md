---
"@loopress/cli": patch
---

`lps doctor` now tells "Application Passwords disabled for this account" apart from bad credentials, instead of sending you to `lps project config` when the account simply can't use Application Passwords. Wrong usernames and passwords keep the existing hint.
