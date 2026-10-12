import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, unwrap } from "./helpers/environment.js";

type WpPage = { id: number; slug: string };

// Unique slug per run: pushed pages can't be edited in wp-admin and stay on the shared
// instance until the afterEach below deletes them.
let slug: string;

test.beforeEach(() => {
	slug = `e2e-page-${Date.now()}`;
});

// wp/v2 DELETE only checks delete_post, which PageFilters leaves open on purpose.
test.afterEach(async ({ requestUtils }) => {
	const pages = await requestUtils.rest<WpPage[]>({
		path: "/wp/v2/pages",
		params: { slug, status: "any" },
	});
	for (const page of pages) {
		await requestUtils.rest({ method: "DELETE", path: `/wp/v2/pages/${page.id}`, params: { force: true } });
	}
});

function writePage(projectDir: string, name: string, content: string): void {
	const pagesDir = join(projectDir, "pages");
	mkdirSync(pagesDir, { recursive: true });
	writeFileSync(join(pagesDir, `${name}.html`), content);
}

test("renders the pushed HTML inside the theme, without wpautop, and locks the page in wp-admin", async ({
	page,
	projectDir,
	requestUtils,
	runCli,
	wp,
}) => {
	// The blank line and bare line break are exactly what wpautop would turn into <p>/<br>.
	writePage(
		projectDir,
		slug,
		`<!--\ntitle: E2E ${slug}\nstatus: publish\n-->\n<section id="e2e-static">\nfirst line\nsecond line\n\n<span>after blank</span>\n</section>\n`,
	);

	const pushResult = await runCli(["page", "push"]);
	expect(pushResult.exitCode, pushResult.stderr).toBe(0);

	const [created] = await requestUtils.rest<WpPage[]>({ path: "/wp/v2/pages", params: { slug, status: "any" } });
	expect(created).toBeDefined();

	// Rendered inside the theme (its <body> classes are there), from the meta, untouched.
	await page.goto(`${wp.url}/${slug}/`);
	await expect(page.locator("body.page")).toBeVisible();
	const section = page.locator("#e2e-static");
	await expect(section).toContainText("after blank");
	expect(await section.locator("p, br").count()).toBe(0);

	// wp-admin > Pages: badge, no Edit link, Trash still offered. `s=` searches titles, hence
	// the slug in the title above.
	await page.goto(`${wp.url}/wp-admin/edit.php?post_type=page&s=${slug}`);
	const row = page.locator(`#post-${created.id}`);
	await expect(row).toContainText("Managed by Loopress");
	await expect(row.locator(".row-actions .edit")).toHaveCount(0);
	await expect(row.locator(".row-actions .trash")).toHaveCount(1);

	// The editor itself is refused.
	await page.goto(`${wp.url}/wp-admin/post.php?post=${created.id}&action=edit`);
	await expect(page.locator("body")).toContainText("not allowed to edit");

	// Declarative status: back to draft unpublishes on the next push.
	writePage(projectDir, slug, `<!-- status: draft -->\n<p>draft now</p>\n`);
	const draftPush = await runCli(["page", "push", slug]);
	expect(draftPush.exitCode, draftPush.stderr).toBe(0);
	const listResult = await runCli(["page", "list"]);
	expect(listResult.stdout).toMatch(new RegExp(`${slug}\\s+draft`));

	const diffResult = await runCli(["diff", "--only", "page"]);
	expect(diffResult.exitCode, diffResult.stdout).toBe(0);
});

test("refuses to take over a page Loopress didn't create, without touching it", async ({ projectDir, requestUtils, runCli }) => {
	await requestUtils.rest({
		method: "POST",
		path: "/wp/v2/pages",
		data: { slug, status: "publish", title: "Hand made", content: "<p>keep me</p>" },
	});
	writePage(projectDir, slug, "<p>replacement</p>");

	const pushResult = await runCli(["page", "push"]);
	expect(pushResult.exitCode).not.toBe(0);
	expect(unwrap(pushResult.stderr)).toContain("not managed by Loopress");

	const [untouched] = await requestUtils.rest<Array<{ content: { raw: string } }>>({
		path: "/wp/v2/pages",
		params: { slug, context: "edit" },
	});
	expect(untouched.content.raw).toBe("<p>keep me</p>");
});

test("refuses a non-.html file in pages/ before any network call", async ({ projectDir, runCli }) => {
	writePage(projectDir, slug, "<p>ok</p>");
	writeFileSync(join(projectDir, "pages", "evil.php"), "<?php");

	const pushResult = await runCli(["page", "push"]);
	expect(pushResult.exitCode).not.toBe(0);
	expect(unwrap(pushResult.stderr)).toContain("only .html files are allowed");

	const listResult = await runCli(["page", "list"]);
	expect(listResult.stdout).not.toContain(slug);
});

test("refuses a page that is in the trash and asks to restore it, without creating a second one", async ({
	projectDir,
	requestUtils,
	runCli,
}) => {
	writePage(projectDir, slug, "<p>v1</p>");
	expect((await runCli(["page", "push"])).exitCode).toBe(0);
	const [created] = await requestUtils.rest<WpPage[]>({ path: "/wp/v2/pages", params: { slug, status: "any" } });
	await requestUtils.rest({ method: "DELETE", path: `/wp/v2/pages/${created.id}` });

	writePage(projectDir, slug, "<p>v2</p>");
	const pushResult = await runCli(["page", "push"]);
	expect(pushResult.exitCode).not.toBe(0);
	expect(unwrap(pushResult.stderr)).toContain("is in the trash");

	const live = await requestUtils.rest<WpPage[]>({ path: "/wp/v2/pages", params: { slug, status: "any" } });
	expect(live).toEqual([]);

	// Trashed pages are out of the afterEach's slug lookup (WordPress renamed them), clean up here.
	await requestUtils.rest({ method: "DELETE", path: `/wp/v2/pages/${created.id}`, params: { force: true } });
});

// The plugin writes through wp_insert_post()/update_post_meta(), which both unslash their
// input: without wp_slash() every backslash in inline JS or a regex would silently vanish.
test("keeps backslashes in the pushed HTML and reports drift in page diff", async ({ page, projectDir, runCli, wp }) => {
	const html = `<script>window.e2eBackslash = "a\\\\b";</script>\n<p id="e2e-bs">done</p>\n`;
	writePage(projectDir, slug, `<!-- status: publish -->\n${html}`);
	expect((await runCli(["page", "push"])).exitCode).toBe(0);

	await page.goto(`${wp.url}/${slug}/`);
	await expect(page.locator("#e2e-bs")).toBeVisible();
	expect(await page.evaluate(() => (window as unknown as { e2eBackslash: string }).e2eBackslash)).toBe("a\\b");

	const inSync = await runCli(["page", "diff", "--json"]);
	expect(inSync.exitCode, inSync.stdout).toBe(0);

	writePage(projectDir, slug, `<!-- status: publish -->\n<p>changed</p>\n`);
	const drift = await runCli(["page", "diff", "--json"]);
	expect(drift.exitCode).toBe(1);
	expect(JSON.parse(drift.stdout).resources.page.changed.map((change: { id: string }) => change.id)).toEqual([slug]);
});

// Shortcodes run on the page HTML (the_content priority 0 is before do_shortcode). Many real
// shortcodes (tabs, accordions) run the_content on their own inner content; that nested run
// must get its own text back, not the whole page again, or rendering recurses until PHP dies.
test("runs shortcodes in the page, including one that nests the_content", async ({ page, projectDir, runCli, wp }) => {
	const stamp = Date.now();
	const hookSlug = `e2e-page-shortcode-${stamp}`;
	mkdirSync(join(projectDir, "hooks"), { recursive: true });
	writeFileSync(
		join(projectDir, "hooks", `${hookSlug}.php`),
		[
			"<?php",
			"",
			"declare(strict_types=1);",
			"",
			"use Loopress\\Hooks\\Attribute\\Action;",
			"",
			`final class E2ePageShortcode${stamp}`,
			"{",
			"    #[Action('init')]",
			"    public function register(): void",
			"    {",
			`        add_shortcode('e2e_wrap_${stamp}', static fn ($atts, $inner = '') => '<div class="e2e-wrap">' . apply_filters('the_content', (string) $inner) . '</div>');`,
			"    }",
			"}",
			"",
		].join("\n"),
	);
	expect((await runCli(["hook", "push"])).exitCode).toBe(0);

	try {
		writePage(projectDir, slug, `<!-- status: publish -->\n[e2e_wrap_${stamp}]<span id="e2e-inner">inner</span>[/e2e_wrap_${stamp}]\n`);
		expect((await runCli(["page", "push"])).exitCode).toBe(0);

		const response = await page.goto(`${wp.url}/${slug}/`);
		expect(response?.status()).toBe(200);
		await expect(page.locator(".e2e-wrap #e2e-inner")).toHaveText("inner");
		expect(await page.locator(".e2e-wrap").count()).toBe(1);
	} finally {
		await runCli(["hook", "rm", hookSlug, "--yes"]);
	}
});
