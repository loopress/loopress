---
title: Security Audit
description: Surface known CVEs and abandoned packages in your installed Composer dependencies.
---

The **Security Audit** banner runs `composer audit` against your installed packages and surfaces the results in the Loopress admin page. It checks for known security advisories and packages that have been marked as abandoned by their authors.

## What it reports

### Security advisories

A red notice is shown for each package that has a known CVE or security advisory. Each notice includes:

- Package name
- CVE identifier (if available)
- Advisory title
- Affected version range
- Link to the full advisory

### Abandoned packages

A yellow warning is shown for packages that Packagist has flagged as abandoned. Where the author has suggested a replacement, it is shown in the notice.

## Behaviour

- The audit runs automatically when the Loopress admin page is loaded, with results cached for **5 minutes**.
- If the audit returns no results (no advisories, no abandoned packages), the banner is hidden.
- If the audit request fails, the banner is hidden silently and never blocks normal usage.

## Resolving advisories

1. Check the affected version range and the linked advisory
2. Open the **Dependency Management** card and install a patched version
3. Reload the page; the banner will update automatically (or clear after the 5-minute cache)

## REST API

The audit data is exposed at `GET /wp-json/loopress/v1/composer/audit`:

```json
{
  "advisories": {
    "some/package": [
      {
        "advisoryId": "PKSA-...",
        "packageName": "some/package",
        "remoteId": "CVE-2024-...",
        "title": "Remote code execution via ...",
        "link": "https://github.com/advisories/...",
        "cve": "CVE-2024-12345",
        "affectedVersions": ">=1.0,<1.4.2",
        "reportedAt": "2024-03-01T00:00:00+00:00"
      }
    ]
  },
  "abandoned": {
    "old/package": "new/replacement"
  }
}
```

An exit code of `1` from `composer audit` means advisories were found; this is treated as a valid (non-error) response.
