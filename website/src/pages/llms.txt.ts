import type { APIRoute } from "astro";
import { alternatives } from "@/components/site/alternatives";

export const prerender = true;

const DOCS = "https://docs.loopress.dev";

export const GET: APIRoute = () => {
  const lines = [
    "# Loopress",
    "",
    "> Loopress puts the configuration and code of a WordPress site in Git: pull, diff, push and roll back with the lps CLI, on the site you already have. Content (posts, orders, users) is never overwritten.",
    "",
    "## Site",
    "",
    "- [Home](https://loopress.dev/): what Loopress is and how the loop works",
    "- [Loopress Light](https://loopress.dev/light): the plugin from WordPress.org",
    "- [FAQ](https://loopress.dev/faq): common questions",
    "- [Changelog](https://loopress.dev/changelog): releases",
    "- [Comparisons](https://loopress.dev/vs): Loopress next to other tools",
    ...alternatives.map(
      (a) => `- [Loopress vs ${a.name}](https://loopress.dev/vs/${a.slug})`,
    ),
    "",
    "## Documentation",
    "",
    `- [Documentation index for LLMs](${DOCS}/llms.txt): all documentation sets`,
    `- [Core concepts](${DOCS}/_llms-txt/core-concepts.txt): getting started, concepts, workflow`,
    `- [CLI reference](${DOCS}/_llms-txt/cli-reference.txt): the lps commands and the MCP server`,
    `- [Resource guides](${DOCS}/_llms-txt/resource-guides.txt): hooks, api, acf, options, menus, ...`,
    `- [Cookbook](${DOCS}/_llms-txt/cookbook.txt): recipes`,
    `- [Blog](${DOCS}/_llms-txt/blog.txt): articles`,
    `- [Abridged documentation](${DOCS}/llms-small.txt): core loop and CLI reference in one file`,
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
