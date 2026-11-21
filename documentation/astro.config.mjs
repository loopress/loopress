// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightBlog from "starlight-blog";
import starlightSidebarTopics from "starlight-sidebar-topics";
import sitemap from "@astrojs/sitemap";
import indexnow from "astro-indexnow";
import { createRequire } from "module";
import { copyFileSync, mkdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import starlightLlmsTxt from 'starlight-llms-txt'
import starlightImageZoom from 'starlight-image-zoom'

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(import.meta.url);

const logoBlack = require.resolve("@loopress/assets/loopress-logo-black.svg");
const logoWhite = require.resolve("@loopress/assets/loopress-logo-white.svg");

/** @returns {import('astro').AstroIntegration} */
function loopressFavicon() {
	return {
		name: "loopress-favicon",
		hooks: {
			"astro:config:setup": () => {
				mkdirSync(join(__dirname, "public"), { recursive: true });
				copyFileSync(logoBlack, join(__dirname, "public", "favicon.svg"));
			},
		},
	};
}

// https://astro.build/config
export default defineConfig({
	site: "https://docs.loopress.dev",
	integrations: [
		loopressFavicon(),
		starlight({
			title: "Loopress",
			favicon: "/favicon.svg",
			logo: {
				light: logoBlack,
				dark: logoWhite,
				alt: "Loopress",
			},
			components: {
				Head: "./src/components/Head.astro",
				SiteTitle: "./src/components/SiteTitle.astro",
				MarkdownContent: "./src/components/MarkdownContent.astro",
			},
			plugins: [
				starlightLlmsTxt({
					description:
						"Loopress puts the configuration and code of a WordPress site (hooks, REST routes, ACF, options, menus, themes, plugins) in Git: pull, diff, push and roll back with the lps CLI, on the site you already have.",
					details:
						"Site: https://loopress.dev/. Sections of these docs: Getting started, Concepts and Workflow (the core loop), CLI reference, resource guides (hooks, api, acf, options, menus, themes, plugins, ...), CI, WordPress plugin, Cookbook (recipes) and Blog.",
					customSets: [
						{
							label: "Core concepts",
							description: "getting started, concepts, workflow and project layout",
							paths: ["getting-started", "concepts", "workflow", "loopress-json", "rollback"],
						},
						{
							label: "CLI reference",
							description: "the lps commands and the MCP server",
							paths: ["cli/**"],
						},
						{
							label: "Resource guides",
							description: "one guide per WordPress resource (hooks, api, acf, options, menus, ...)",
							paths: [
								"account",
								"acf",
								"api/**",
								"apps/**",
								"application-passwords",
								"block-patterns",
								"composer/**",
								"custom-post-types",
								"dynamic-blocks",
								"editor-setup",
								"forms",
								"hooks",
								"menus",
								"options",
								"pages",
								"plugins",
								"post-meta",
								"roles",
								"snippets",
								"taxonomies",
								"theme-styles",
								"themes",
							],
						},
						{
							label: "CI and WordPress plugin",
							description: "setup-ci and the Loopress plugin",
							paths: ["ci/**", "wordpress-plugin/**"],
						},
						{
							label: "Cookbook",
							description: "recipes built with Loopress resources",
							paths: ["cookbook/**"],
						},
						{
							label: "Blog",
							description: "articles on managing WordPress as code",
							paths: ["blog/**"],
						},
					],
					// llms-small.txt keeps the core loop and the CLI reference only
					exclude: [
						"account",
						"acf",
						"api/**",
						"apps/**",
						"application-passwords",
						"block-patterns",
						"blog/**",
						"ci/**",
						"composer/**",
						"cookbook/**",
						"custom-post-types",
						"dynamic-blocks",
						"editor-setup",
						"forms",
						"hooks",
						"menus",
						"options",
						"pages",
						"plugins",
						"post-meta",
						"roles",
						"snippets",
						"taxonomies",
						"theme-styles",
						"themes",
						"wordpress-plugin/**",
					],
				}),
				starlightImageZoom(),
				starlightBlog({
					authors: {
						maxime: {
							name: "Maxime Blanc",
							url: "https://github.com/jean-smaug",
						},
					},
				}),
				starlightSidebarTopics(
					[
						{
							label: "Documentation",
							link: "/getting-started/",
							icon: "open-book",
							items: [
								{ label: "Getting Started", slug: "getting-started" },
								{ label: "Concepts", slug: "concepts" },
								{ label: "Multi-Environment Workflow", slug: "workflow" },
								{ label: "Rollback", slug: "rollback" },
								{
									label: "Code",
									items: [
										{ label: "Snippets", slug: "snippets" },
										{ label: "Hooks", slug: "hooks" },
										{
											label: "API Routes",
											items: [
												{ label: "Overview", slug: "api" },
												{ label: "CLI", slug: "api/cli" },
												{ label: "Writing Route Files", slug: "api/routes" },
												{ label: "Admin UI", slug: "api/admin-ui" },
											],
										},
										{
											label: "Single-Page Apps",
											items: [
												{ label: "Overview", slug: "apps" },
												{ label: "CLI", slug: "apps/cli" },
											],
										},
										{ label: "Static Pages", slug: "pages" },
										{ label: "Block Patterns", slug: "block-patterns" },
										{ label: "Dynamic Blocks", slug: "dynamic-blocks" },
									],
								},
								{
									label: "Configuration",
									items: [
										{ label: "ACF", slug: "acf" },
										{ label: "Forms", slug: "forms" },
										{ label: "Menus", slug: "menus" },
										{ label: "Custom Post Types", slug: "custom-post-types" },
										{ label: "Taxonomies", slug: "taxonomies" },
										{ label: "Post Meta", slug: "post-meta" },
										{ label: "Roles", slug: "roles" },
										{ label: "Options", slug: "options" },
										{ label: "Theme Styles", slug: "theme-styles" },
									],
								},
								{
									label: "Dependencies",
									items: [
										{ label: "Plugins", slug: "plugins" },
										{ label: "Themes", slug: "themes" },
										{
											label: "Composer",
											items: [
												{ label: "Overview", slug: "composer" },
												{ label: "CLI", slug: "composer/cli" },
												{ label: "Admin UI", slug: "composer/admin-ui" },
												{ label: "Security Audit", slug: "composer/audit" },
												{ label: "Platform Diagnostics", slug: "composer/diagnostics" },
												{ label: "Using Packages in Snippets", slug: "composer/using-in-snippets" },
											],
										},
									],
								},
								{
									label: "CI/CD",
									items: [
										{ label: "Overview", slug: "ci" },
										{ label: "GitHub Actions", slug: "ci/github-actions" },
										{ label: "GitLab CI", slug: "ci/gitlab" },
										{ label: "E2E Testing", slug: "ci/e2e-testing" },
										{ label: "Drift detection", slug: "ci/drift-detection" },
										{ label: "Plugin update PRs", slug: "ci/plugin-update-prs" },
									],
								},
								{
									label: "Reference",
									items: [
										{ label: "WordPress Plugin", slug: "wordpress-plugin" },
										{ label: "Connect a site to the console", slug: "wordpress-plugin/connect-console" },
										{ label: "Leaving Loopress", slug: "leaving-loopress" },
										{ label: "CLI Commands", slug: "cli" },
										{ label: "loopress.json", slug: "loopress-json" },
										{ label: "lps init", slug: "cli/init" },
										{ label: "MCP Server", slug: "cli/mcp" },
										{ label: "lps eject", slug: "cli/eject" },
										{ label: "Loopress Account", slug: "account" },
										{ label: "Editor Setup", slug: "editor-setup" },
									],
								},
								{
									label: "Troubleshooting",
									items: [
										{ label: "lps doctor", slug: "cli/doctor" },
										{ label: "Application Passwords", slug: "application-passwords" },
									],
								},
							],
						},
						{
							label: "Cookbook",
							link: "/cookbook/",
							icon: "puzzle",
							items: [
								{ label: "Overview", slug: "cookbook" },
								{
									label: "Documents & Files",
									items: [{ autogenerate: { directory: "cookbook/documents-and-files" } }],
								},
								{
									label: "Content & Data",
									items: [{ autogenerate: { directory: "cookbook/content-and-data" } }],
								},
								{
									label: "Search & Data Services",
									items: [{ autogenerate: { directory: "cookbook/search-and-data-services" } }],
								},
								{
									label: "Auth & Security",
									items: [{ autogenerate: { directory: "cookbook/auth-and-security" } }],
								},
								{
									label: "Third-Party Integrations",
									items: [{ autogenerate: { directory: "cookbook/third-party-integrations" } }],
								},
								{
									label: "Site as Code",
									items: [{ autogenerate: { directory: "cookbook/site-as-code" } }],
								},
							],
						},
					],
					{
						exclude: ["/blog", "/blog/**"],
					},
				),
			],
			social: [
				{
					icon: "external",
					label: "loopress.dev",
					href: "https://loopress.dev/",
				},
				{
					icon: "github",
					label: "GitHub",
					href: "https://github.com/loopress",
				},
				{
					icon: "youtube",
					label: "YouTube",
					href: "https://www.youtube.com/channel/UC3KPcEgjK0kTtn0nQ2maSfA",
				},
			],
		}),
		sitemap({
			lastmod: new Date(),
			// Thin listing pages: blog tags, authors and pagination (also noindex in Head.astro).
			filter: (page) => !/\/blog\/((tags|authors)\/|\d+\/?$)/.test(page),
		}),
		indexnow({
			key: "e542ad40487f4c508ef8ce9fb107f5e4",
			enabled: true,
		}),
	],
});
