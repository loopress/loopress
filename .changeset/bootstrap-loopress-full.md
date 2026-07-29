---
"@loopress/cli": minor
---

`lps project config` now detects when Loopress Full isn't installed on the target site and offers to install it automatically. Since Loopress Full is never distributed on wordpress.org and normally requires a manual zip upload in wp-admin, this closes that gap: after confirming, the CLI downloads the latest release, creates a temporary administrator account (the only way to get plugin-install rights from an application password), drives the wp-admin upload flow headlessly to install and activate the plugin, then removes the temporary account. If the automated install fails for any reason, the temporary account is still cleaned up and the CLI falls back to printing the downloaded zip's local path plus the direct upload URL so the install can be finished by hand.
