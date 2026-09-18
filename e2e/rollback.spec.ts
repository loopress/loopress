import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./helpers/environment.js";
import { findWpCodeSnippetRow, setPluginActive } from "./helpers/wp-admin.js";

// Regression coverage for a bug where two active snippet plugins made WPCode win silently
// (see snippet-provider-conflict.spec.ts): pin the site to WPCode only for these tests.
test.beforeAll(async ({ requestUtils }) => {
	await setPluginActive(requestUtils, "code-snippets", false);
	await setPluginActive(requestUtils, "insert-headers-and-footers", true);
});

// `id` must be set when editing an already-pushed snippet: `snippet push` reads it from the
// sidecar JSON, not the filename, to decide whether to PUT (update) or POST (create) - an edit
// that dropped it would create a second, unrelated snippet instead of updating the first.
function writeSnippet(
	dir: string,
	basename: string,
	name: string,
	code: string,
	id?: number,
): void {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${basename}.php`), code);
	writeFileSync(
		join(dir, `${basename}.json`),
		JSON.stringify({
			location: "everywhere",
			name,
			type: "php",
			...(id === undefined ? {} : { id }),
		}),
	);
}

test("push, break something, roll back, and land back on the exact prior state", async ({
	page,
	projectDir,
	runCli,
	wp,
}) => {
	const suffix = Date.now();
	const nameV1 = `E2E rollback v1 ${suffix}`;
	const nameV2 = `E2E rollback v2 ${suffix}`;
	const snippetsDir = join(projectDir, "snippets");

	// v1: the good push. Its rollback snapshot won't exist yet (this is the very first push),
	// so nothing to roll back to at this point.
	writeSnippet(
		snippetsDir,
		"rollback-demo",
		nameV1,
		'<?php\n\necho "version one";\n',
	);
	const firstPush = await runCli(["snippet", "push"]);
	expect(firstPush.exitCode).toBe(0);
	await expect(await findWpCodeSnippetRow(page, wp, nameV1)).toBeVisible();

	// v2: "breaks something" (a different name and a different, deliberately broken-looking
	// body). This push writes a snapshot of the v1 state (the environment right before this
	// push) to `.loopress/snapshots/snippet/`.
	const [{ id: v1Id }] = readSidecars(snippetsDir);
	writeSnippet(
		snippetsDir,
		`${v1Id}-rollback-demo`,
		nameV2,
		'<?php\n\necho "version two, oops";\n',
		Number(v1Id),
	);
	const secondPush = await runCli(["snippet", "push"]);
	expect(secondPush.exitCode).toBe(0);
	await expect(await findWpCodeSnippetRow(page, wp, nameV2)).toBeVisible();

	// Roll back: nothing else touched the environment since the v2 push, so this proceeds
	// without needing a drift confirmation.
	const rollback = await runCli(["snippet", "rollback", "--yes"]);
	expect(
		rollback.exitCode,
		`stdout:\n${rollback.stdout}\n\nstderr:\n${rollback.stderr}`,
	).toBe(0);
	expect(rollback.stdout).toContain("Rolled back");

	// The environment is back to exactly v1: same name, same code, on WordPress...
	await expect(await findWpCodeSnippetRow(page, wp, nameV1)).toBeVisible();

	// ...and pulling confirms the local tracked state matches it byte for byte. `snippet pull`
	// pulls every snippet on the (shared, long-lived) e2e site, not just this test's, so find
	// this one by id rather than assuming it's the only or the first file on disk.
	const pull = await runCli(["snippet", "pull"]);
	expect(pull.exitCode).toBe(0);
	const restored = readSidecars(snippetsDir).find((snippet) => snippet.id === v1Id);
	expect(restored?.name).toBe(nameV1);
	expect(restored?.code.trim()).toBe('echo "version one";');
});

test("rollback --list reports the snapshot written by the previous push", async ({
	projectDir,
	runCli,
}) => {
	const snippetsDir = join(projectDir, "snippets");
	writeSnippet(
		snippetsDir,
		"rollback-list-demo",
		`E2E rollback list ${Date.now()}`,
		'<?php\n\necho "hi";\n',
	);

	const push = await runCli(["snippet", "push"]);
	expect(push.exitCode).toBe(0);

	const list = await runCli(["snippet", "rollback", "--list"]);
	expect(list.exitCode).toBe(0);
	expect(list.stdout).toMatch(/Snapshots for "snippet"/);
	expect(list.stdout).toMatch(/\d{10,}\s/);
});

test("rollback refuses when there is nothing to roll back to yet", async ({
	projectDir,
	runCli,
}) => {
	// A brand new project directory: `snippet push` never ran here, so no snapshot exists.
	mkdirSync(join(projectDir, "snippets"), { recursive: true });

	const result = await runCli(["snippet", "rollback"]);

	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain("No snapshots found");
});

// Reads every pushed snippet's `<id>-<slug>.json`/`.php` pair back from disk, id extracted from
// the filename convention `snippet push`/`pull` use (see cli/src/utils/snippet-format.ts).
function readSidecars(
	dir: string,
): Array<{ code: string; id: string; name: string }> {
	const files = readdirSync(dir);
	const bases = [
		...new Set(
			files
				.filter((file) => file.endsWith(".json"))
				.map((file) => file.slice(0, -".json".length)),
		),
	];

	return bases.map((base) => {
		const meta = JSON.parse(
			readFileSync(join(dir, `${base}.json`), "utf8"),
		) as { id?: number; name: string };
		const codeFile = files.find(
			(file) => file.startsWith(`${base}.`) && !file.endsWith(".json"),
		)!;
		return {
			code: readFileSync(join(dir, codeFile), "utf8"),
			id: String(meta.id ?? ""),
			name: meta.name,
		};
	});
}
