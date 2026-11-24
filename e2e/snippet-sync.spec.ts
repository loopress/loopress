import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./helpers/environment.js";
import {
	findWpCodeSnippetRow,
	setPluginActive,
	trashWpCodeSnippet,
} from "./helpers/wp-admin.js";

// Regression coverage for a bug where two active snippet plugins made WPCode win silently
// (see snippet-provider-conflict.spec.ts): pin the site to WPCode only for these tests.
test.beforeAll(async ({ requestUtils }) => {
	await setPluginActive(requestUtils, "code-snippets", false);
	await setPluginActive(requestUtils, "insert-headers-and-footers", true);
});

function writeSnippet(
	dir: string,
	basename: string,
	name: string,
	code: string,
): void {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${basename}.php`), code);
	writeFileSync(
		join(dir, `${basename}.json`),
		JSON.stringify({ location: "everywhere", name, type: "php" }),
	);
}

test("pushes a new snippet and it appears correctly in the WPCode admin list", async ({
	page,
	projectDir,
	runCli,
	wp,
}) => {
	const name = `E2E round trip ${Date.now()}`;
	const snippetsDir = join(projectDir, "snippets");
	writeSnippet(
		snippetsDir,
		"roundtrip",
		name,
		'<?php\n\necho "hello from e2e";\n',
	);

	const result = await runCli(["snippet", "push"]);
	expect(result.exitCode).toBe(0);
	expect(result.stdout).toContain("All snippets pushed");

	const row = await findWpCodeSnippetRow(page, wp, name);
	await expect(row).toBeVisible();
	await expect(row.locator(".code_type")).toContainText("php");
	await expect(row.locator(".location")).toContainText("Run Everywhere");
});

test("skips a snippet with a malformed sidecar instead of blocking the others", async ({
	page,
	projectDir,
	runCli,
	wp,
}) => {
	const goodName = `E2E isolation good ${Date.now()}`;
	const snippetsDir = join(projectDir, "snippets");
	mkdirSync(snippetsDir, { recursive: true });
	writeFileSync(join(snippetsDir, "broken.php"), "<?php echo 1;");
	writeFileSync(
		join(snippetsDir, "broken.json"),
		"{ this is not valid json !!",
	);
	writeSnippet(snippetsDir, "good", goodName, "<?php echo 2;");

	const result = await runCli(["snippet", "push"]);
	// The good snippet is still pushed, but the run ends non-zero naming what it left out.
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain("Skipping");
	expect(result.stderr).toContain("left out");
	expect(result.stderr).toContain("broken.json");

	const row = await findWpCodeSnippetRow(page, wp, goodName);
	await expect(row).toBeVisible();
});

test("removes local files for a snippet deleted on WordPress, and does not resurrect it on the next push", async ({
	page,
	projectDir,
	runCli,
	wp,
}) => {
	const name = `E2E delete ${Date.now()}`;
	const snippetsDir = join(projectDir, "snippets");
	writeSnippet(snippetsDir, "to-delete", name, '<?php echo "bye";');

	await runCli(["snippet", "push"]);
	await expect(await findWpCodeSnippetRow(page, wp, name)).toBeVisible();

	await trashWpCodeSnippet(page, wp, name);

	const pullResult = await runCli(["snippet", "pull"]);
	expect(pullResult.exitCode).toBe(0);
	expect(pullResult.stderr).toContain("Removed");

	const remainingFiles = readdirSync(snippetsDir);
	expect(remainingFiles.some((file) => file.includes("to-delete"))).toBe(false);

	const pushResult = await runCli(["snippet", "push"]);
	expect(pushResult.exitCode).toBe(0);

	await page.goto(`${wp.url}/wp-admin/admin.php?page=wpcode`);
	await expect(page.getByRole("link", { exact: true, name })).toHaveCount(0);
});

// Regression test: an invalid location used to still create the snippet on WordPress (with
// the location silently coerced to a default), while reporting failure to the CLI. Since the
// CLI never learned the id it never renamed the local file, so retrying the push (the natural
// response to a reported failure) created another duplicate each time. This asserts nothing
// is ever created at all, across two attempts.
test("rejects an invalid location without creating a snippet, even after retrying the push", async ({
	page,
	projectDir,
	runCli,
	wp,
}) => {
	const name = `E2E bad location ${Date.now()}`;
	const snippetsDir = join(projectDir, "snippets");
	mkdirSync(snippetsDir, { recursive: true });
	writeFileSync(join(snippetsDir, "bad-location.html"), "<p>bad location</p>");
	writeFileSync(
		join(snippetsDir, "bad-location.json"),
		JSON.stringify({ location: "everywhere", name, type: "html" }),
	);

	const first = await runCli(["snippet", "push"]);
	expect(first.exitCode).not.toBe(0);

	const second = await runCli(["snippet", "push"]);
	expect(second.exitCode).not.toBe(0);

	await page.goto(`${wp.url}/wp-admin/admin.php?page=wpcode`);
	await expect(page.getByRole("link", { exact: true, name })).toHaveCount(0);
});

test("never touches a hand-created file with no numeric id prefix while cleaning up orphans", async ({
	projectDir,
	runCli,
}) => {
	const snippetsDir = join(projectDir, "snippets");
	mkdirSync(snippetsDir, { recursive: true });
	writeFileSync(
		join(snippetsDir, "hand-written.php"),
		'<?php echo "not yet pushed";',
	);

	const result = await runCli(["snippet", "pull"]);
	expect(result.exitCode).toBe(0);
	expect(existsSync(join(snippetsDir, "hand-written.php"))).toBe(true);
});

test("deletes a snippet removed from the repo on push, and keeps it with --no-prune", async ({
	page,
	projectDir,
	runCli,
	wp,
}) => {
	const keepName = `E2E prune keep ${Date.now()}`;
	const goneName = `E2E prune gone ${Date.now()}`;
	const snippetsDir = join(projectDir, "snippets");
	writeSnippet(snippetsDir, "keep", keepName, "<?php echo 1;");
	writeSnippet(snippetsDir, "gone", goneName, "<?php echo 2;");
	expect((await runCli(["snippet", "push"])).exitCode).toBe(0);

	// Both files are now `<id>-<slug>`: remove the second one, as `git rm` would.
	const goneFiles = readdirSync(snippetsDir).filter((f) => f.includes("gone"));
	expect(goneFiles.length).toBeGreaterThan(0);
	for (const file of goneFiles) rmSync(join(snippetsDir, file));

	const kept = await runCli(["snippet", "push", "--no-prune"]);
	expect(kept.exitCode).toBe(0);
	await expect(await findWpCodeSnippetRow(page, wp, goneName)).toBeVisible();

	const dry = await runCli(["snippet", "push", "--dry-run"]);
	expect(dry.stdout).toContain("Would prune 1 snippet");
	await expect(await findWpCodeSnippetRow(page, wp, goneName)).toBeVisible();

	const pruned = await runCli(["snippet", "push", "--yes"]);
	expect(pruned.exitCode).toBe(0);
	expect(pruned.stdout).toContain("Pruned");
	await expect(await findWpCodeSnippetRow(page, wp, keepName)).toBeVisible();
	const listed = await runCli(["snippet", "list"]);
	expect(listed.stdout).toContain(keepName);
	expect(listed.stdout).not.toContain(goneName);
});
