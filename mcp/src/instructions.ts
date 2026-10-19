// Sent to the agent when it connects: what a Loopress project is, and where each file format
// is documented. Without it an agent writes plain WordPress code (a bare add_filter() in
// hooks/), which validate_local and push then reject. Links rather than inline formats, so
// this never drifts from the docs. Default directories, loopress.json can rename them.
export const SERVER_INSTRUCTIONS = `Loopress keeps a WordPress site's code and configuration as plain files in this project (loopress.json at its root), and these tools sync them with the site.

Each resource has a strict file format, different from plain WordPress code: read its page before writing or changing one of its files.
- hooks/ (actions, filters, cron): https://docs.loopress.dev/hooks/
- api/ (custom REST API routes): https://docs.loopress.dev/api/routes/
- apps/ (Vue, React or Svelte bundles): https://docs.loopress.dev/apps/
- snippets/ (Code Snippets or WPCode): https://docs.loopress.dev/snippets/
- acf/ (ACF field groups): https://docs.loopress.dev/acf/
- cpt/ (custom post types): https://docs.loopress.dev/custom-post-types/
- taxonomies/: https://docs.loopress.dev/taxonomies/
- meta/ (post meta): https://docs.loopress.dev/post-meta/
- roles/: https://docs.loopress.dev/roles/
- pages/ and theme/templates/, theme/parts/: https://docs.loopress.dev/pages/
- patterns/ (block patterns): https://docs.loopress.dev/block-patterns/
- theme/ (theme styles): https://docs.loopress.dev/theme-styles/
- menus/: https://docs.loopress.dev/menus/
- options/: https://docs.loopress.dev/options/
- forms/: https://docs.loopress.dev/forms/
- plugins: https://docs.loopress.dev/plugins/

To ship a change: edit the local files, run validate_local (the same checks push runs), then the resource's _push tool, which previews before applying. A push can be undone with the resource's _rollback tool.`
