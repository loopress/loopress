---
"@loopress/cli": patch
---

`lps api push` now rejects a file missing `declare(strict_types=1);` (or containing it more than once) before making any network call, mirroring the server's own check instead of failing only after the round-trip.
