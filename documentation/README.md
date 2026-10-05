# Loopress documentation

Source of [docs.loopress.dev](https://docs.loopress.dev), built with [Astro Starlight](https://starlight.astro.build).

```bash
pnpm --filter @loopress/documentation dev     # local dev server on localhost:4321
pnpm --filter @loopress/documentation build   # production build into dist/
```

## Layout

| Path | Content |
|------|---------|
| `src/content/docs/` | Every page, one `.md`/`.mdx` file per route |
| `src/content/docs/blog/` | Blog posts (`starlight-blog`) |
| `src/content/docs/cookbook/` | Cookbook recipes, one folder per category |
| `src/content.config.ts` | Frontmatter schema, including the Loopress-specific fields below |
| `src/components/MarkdownContent.astro` | Renders the edition note, the cookbook intro, video and closing CTA |
| `astro.config.mjs` | Sidebar and redirects |

The sidebar is maintained by hand in `astro.config.mjs`: add every new page there. When a page moves or is removed, add a redirect from its old URL.

## Writing a page

- **Edition.** On a feature page, set `edition: full` (Loopress Full only) or `edition: light` (both editions) in the frontmatter. The note at the top of the page is rendered from it, don't write one by hand.
- **Shared rules live once.** `--env`, `--dry-run`, `--yes`, `--json`, how `pull` removes local files, and why to pull before editing are documented in `concepts.md`. Link to it instead of repeating them. Rollback is documented in `rollback.md`, the aggregate commands in `workflow.md`, every `loopress.json` field in `loopress-json.md`.
- **Feature page outline.** Intro and requirements, `## Typical workflow`, `## Commands` with one `###` section per command in the order `add`, `pull`, `push`, `list`, `diff`, `rollback`, `status`, `audit`, `rm`/`remove`, `publish`, then `## File format`, then limits.
- **Titles** are in Title Case and say which feature they belong to (`Composer CLI`, not `CLI`). Sidebar labels can stay short.
- **Cookbook recipes** set `kind` (`route`, `snippet` or `app`) and optionally `youtubeId`.
- Never use the em dash. Use a comma, a period, or rephrase.

When a CLI command changes, also update the page documenting it, the table in `cli/index.md`, and the MCP tool table in `cli/mcp.md`.
