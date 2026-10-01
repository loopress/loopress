---
"@loopress/cli": patch
---

A refused WordPress or Loopress API request no longer ends its error with the raw `Caused by: HTTPError ... Code: ERR_NON_2XX_3XX_RESPONSE` lines: the server's own reason, already in the message, is now the last thing printed. `LPS_DEBUG=1` still shows the whole chain.
