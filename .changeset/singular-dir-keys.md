---
'@loopress/cli': minor
---

Rename the `loopress.json` directory keys to the singular form used by the others: `hooksDir` is now `hookDir`, `optionsDir` is now `optionDir`, `appsDir` is now `appDir` and `themeStylesDir` is now `themeStyleDir`. The old keys are no longer read, so rename them in existing `loopress.json` files.
