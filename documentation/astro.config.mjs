// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightBlog from "starlight-blog";
import sitemap from "@astrojs/sitemap";
import indexnow from "astro-indexnow";
import { createRequire } from "module";
import { copyFileSync, mkdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

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
	redirects: {
		"/": "/getting-started",
		// Functional re-cut of the docs: technical CLI/WordPress Plugin split replaced by
		// one page/section per feature. Old URLs kept alive for bookmarks and backlinks.
		"/cli/acf": "/acf",
		"/cli/seo": "/seo",
		"/cli/forms": "/forms",
		"/cli/plugins": "/plugins",
		"/cli/snippets": "/snippets",
		"/cli/composer": "/composer/cli",
		"/cli/api": "/api/cli",
		"/wordpress-plugin/dependencies": "/composer/admin-ui",
		"/wordpress-plugin/audit": "/composer/audit",
		"/wordpress-plugin/diagnostics": "/composer/diagnostics",
		"/wordpress-plugin/code-snippets": "/composer/using-in-snippets",
		"/wordpress-plugin/api": "/api/admin-ui",
	},
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
				starlightBlog({
					authors: {
						maxime: {
							name: "Maxime Blanc",
							url: "https://github.com/jean-smaug",
						},
					},
				}),
			],
			social: [
				{
					icon: "github",
					label: "GitHub",
					href: "https://github.com/loopress",
				},
			],
			sidebar: [
				{
					label: "Getting Started",
					slug: "getting-started"
				},
				{
					label: "Application Passwords",
					slug: "application-passwords",
				},
				{
					label: "Editor Setup",
					slug: "editor-setup",
				},
				{
					label: "CLI",
					items: [
						{ label: "Overview", slug: "cli" },
						{ label: "Getting Started", slug: "cli/getting-started" },
						{ label: "Init", slug: "cli/init" },
							{ label: "Doctor", slug: "cli/doctor" },
					],
				},
				{
					label: "WordPress Plugin",
					slug: "wordpress-plugin",
				},
				{
					label: "Features",
					items: [
						{ label: "Snippets", slug: "snippets" },
						{ label: "ACF", slug: "acf" },
						{ label: "SEO", slug: "seo" },
						{ label: "Forms", slug: "forms" },
						{ label: "Pages", slug: "pages" },
						{ label: "Plugins", slug: "plugins" },
						{
							label: "Composer",
							items: [
								{ label: "Overview", slug: "composer" },
								{ label: "CLI", slug: "composer/cli" },
								{ label: "Admin UI", slug: "composer/admin-ui" },
								{ label: "Security Audit", slug: "composer/audit" },
								{ label: "Platform Diagnostics", slug: "composer/diagnostics" },
								{
									label: "Using packages in snippets",
									slug: "composer/using-in-snippets",
								},
							],
						},
						{
							label: "API Routes",
							items: [
								{ label: "Overview", slug: "api" },
								{ label: "CLI", slug: "api/cli" },
									{ label: "Writing Route Files", slug: "api/routes" },
								{ label: "Admin UI", slug: "api/admin-ui" },
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
					],
				},
			],
		}),
		sitemap(),
		indexnow({
			key: "e542ad40487f4c508ef8ce9fb107f5e4",
			enabled: true,
		}),
	],
});
