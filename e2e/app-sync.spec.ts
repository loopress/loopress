import {Buffer} from "node:buffer";
import {mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";

import {expect, test} from "./helpers/environment.js";

function authHeader(wp: {appPassword: string; username: string}): string {
	return `Basic ${Buffer.from(`${wp.username}:${wp.appPassword}`).toString("base64")}`;
}

// A minimal built SPA: index.html referencing one content-hashed module script and one
// stylesheet, plus the two asset files. Enough to exercise the whole push -> commit ->
// shortcode -> pull round trip without a real bundler.
function scaffoldApp(projectDir: string, name: string, jsBody: string): void {
	const dist = join(projectDir, "apps", name, "dist", "assets");
	mkdirSync(dist, {recursive: true});
	writeFileSync(join(projectDir, "apps", name, "loopress.app.json"), "{}\n");
	writeFileSync(join(dist, "index-abc.js"), jsBody);
	writeFileSync(join(dist, "index-abc.css"), "body{margin:0}");
	writeFileSync(
		join(projectDir, "apps", name, "dist", "index.html"),
		'<!doctype html><html><head>' +
			'<link rel="stylesheet" href="/assets/index-abc.css">' +
			'<script type="module" src="/assets/index-abc.js"></script>' +
			"</head><body></body></html>\n",
	);
}

test("pushes a built app, serves it through the shortcode, then pulls it back", async ({
	page,
	projectDir,
	request,
	runCli,
	wp,
}) => {
	const name = `e2e-search-${Date.now()}`;
	scaffoldApp(projectDir, name, "export const v = 1");

	const pushResult = await runCli(["app", "push", name]);
	expect(pushResult.exitCode, pushResult.stderr).toBe(0);

	// The app is now listed by the CLI and by the plugin's REST endpoint.
	const listResult = await runCli(["app", "list"]);
	expect(listResult.exitCode).toBe(0);
	expect(listResult.stdout).toContain(name);

	const apiList = await request.get(`${wp.url}/wp-json/loopress/v1/apps`, {
		headers: {Authorization: authHeader(wp)},
	});
	expect(apiList.ok()).toBe(true);
	const apps = (await apiList.json()) as Array<{committed: boolean; name: string}>;
	expect(apps.find((app) => app.name === name)?.committed).toBe(true);

	// The built asset is served straight off wp-content.
	const asset = await request.get(`${wp.url}/wp-content/loopress/apps/${name}/assets/index-abc.js`);
	expect(asset.ok()).toBe(true);
	expect(await asset.text()).toContain("export const v = 1");

	// A published page with the shortcode renders the SPA mount point and enqueues the
	// content-hashed module entry straight off wp-content.
	const createPage = await request.post(`${wp.url}/wp-json/wp/v2/pages`, {
		data: {content: `[loopress_app name="${name}"]`, status: "publish", title: `app-e2e-${name}`},
		headers: {Authorization: authHeader(wp)},
	});
	expect(createPage.ok(), await createPage.text()).toBe(true);
	const {id: pageId, link} = (await createPage.json()) as {id: number; link: string};

	await page.goto(link);
	await expect(page.locator(`#loopress-app-${name}`)).toBeAttached();
	await expect(
		page.locator(`script[src*="/wp-content/loopress/apps/${name}/assets/index-abc.js"]`),
	).toBeAttached();

	await request.delete(`${wp.url}/wp-json/wp/v2/pages/${pageId}?force=true`, {
		headers: {Authorization: authHeader(wp)},
	});

	// Pull into a clean directory and check the round trip.
	rmSync(join(projectDir, "apps", name), {force: true, recursive: true});
	const pullResult = await runCli(["app", "pull"]);
	expect(pullResult.exitCode, pullResult.stderr).toBe(0);
	expect(readFileSync(join(projectDir, "apps", name, "dist", "assets", "index-abc.js"), "utf8")).toContain(
		"export const v = 1",
	);

	// Remove it from the site.
	const removeResult = await runCli(["app", "remove", name, "--yes"]);
	expect(removeResult.exitCode, removeResult.stderr).toBe(0);

	const listAfter = await runCli(["app", "list"]);
	expect(listAfter.stdout).not.toContain(name);
});

test("re-pushing only uploads the files whose content changed", async ({projectDir, runCli}) => {
	const name = `e2e-incr-${Date.now()}`;
	scaffoldApp(projectDir, name, "export const v = 1");

	expect((await runCli(["app", "push", name])).exitCode).toBe(0);

	// Change only the JS entry; the CSS and index.html are byte-identical.
	writeFileSync(join(projectDir, "apps", name, "dist", "assets", "index-abc.js"), "export const v = 2");

	const second = await runCli(["app", "push", name, "--json"]);
	expect(second.exitCode, second.stderr).toBe(0);
	const payload = JSON.parse(second.stdout) as {pushed: Array<{name: string; uploaded: number}>};
	expect(payload.pushed.find((app) => app.name === name)?.uploaded).toBe(1);

	await runCli(["app", "remove", name, "--yes"]);
});
