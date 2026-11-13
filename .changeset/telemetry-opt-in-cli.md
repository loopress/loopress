---
"@loopress/cli": minor
---

Crash reporting is now opt-in. The CLI asks once, in the first interactive command (default no), and sends nothing until you say yes. Non-interactive shells and CI never ask and never send until you have run `lps telemetry enable`.
