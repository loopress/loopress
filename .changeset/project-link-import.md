---
"@loopress/cli": minor
---

Renamed `lps project push` to `lps project link` and `lps project pull` to `lps project import`, so `push` and `pull` only mean "talk to the WordPress site". `link` no longer sends application passwords to your Loopress account (it never needed to), and `import` reminds you that imported environments need an app password (`lps project config`). `lps project config` now offers to link the project when you are logged in, and a deployment record or drift report that matches no environment on your account prints a hint to run `lps project link`. `lps api push` no longer sends a request to a route that no longer exists.
