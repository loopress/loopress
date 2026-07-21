// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightBlog from "starlight-blog";
import sitemap from "@astrojs/sitemap";
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
					label: "CLI",
					items: [
						{ label: "Overview", slug: "cli" },
						{ label: "Getting Started", slug: "cli/getting-started" },
						{ label: "Init", slug: "cli/init" },
						{ label: "Snippets", slug: "cli/snippets" },
						{ label: "ACF", slug: "cli/acf" },
						{ label: "RankMath", slug: "cli/rankmath" },
						{ label: "Yoast SEO", slug: "cli/yoast" },
						{ label: "Plugins", slug: "cli/plugins" },
						{ label: "Composer", slug: "cli/composer" },
					],
				},
				{
					label: "WordPress Plugin",
					items: [
						{ label: "Overview", slug: "wordpress-plugin" },
						{
							label: "Dependency Management",
							slug: "wordpress-plugin/dependencies",
						},
						{
							label: "Using packages in snippets",
							slug: "wordpress-plugin/code-snippets",
						},
						{ label: "Security Audit", slug: "wordpress-plugin/audit" },
						{
							label: "Platform Diagnostics",
							slug: "wordpress-plugin/diagnostics",
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
	],
});
