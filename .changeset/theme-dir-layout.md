---
"@loopress/cli": minor
---

Block templates and template parts now live under `theme/`, next to the Global Styles file: `theme/templates/` and `theme/parts/` by default instead of `templates/` and `parts/` at the project root. Everything `lps theme` manages sits in one directory. A project that keeps the old layout sets `templateDir: "templates"` and `partDir: "parts"` in `loopress.json`.
