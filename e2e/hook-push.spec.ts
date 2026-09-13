import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, unwrap } from "./helpers/environment.js";

// Same regression as api-routes-sync.spec.ts's own syntax-check test: HookFilesController's
// push_file() must reject a file with a valid `declare(strict_types=1);` line but otherwise
// broken PHP, not accept it and let it 404/no-op silently once HookLoader tries to require it
// at boot.
test("rejects a hook file with invalid PHP syntax instead of silently accepting it", async ({
	projectDir,
	runCli,
}) => {
	const hooksDir = join(projectDir, "hooks");
	mkdirSync(hooksDir, { recursive: true });
	writeFileSync(
		join(hooksDir, "broken.php"),
		[
			"<?php",
			"",
			"declare(strict_types=1);",
			"",
			"use Loopress\\Hooks\\Attribute\\Action;",
			"",
			"final class Broken",
			"{",
			"    #[Action('init')]",
			"    public function run(): void",
			"    {",
			"        $x = 1", // missing semicolon: genuine syntax error
			"    }",
			"}",
			"",
		].join("\n"),
	);

	const pushResult = await runCli(["hook", "push"]);
	expect(pushResult.exitCode).not.toBe(0);
	expect(unwrap(pushResult.stderr)).toContain("syntax");

	const listResult = await runCli(["hook", "list"]);
	expect(listResult.exitCode).toBe(0);
	expect(listResult.stdout).not.toContain("broken");
});

// A file failing for one reason (bad syntax) must not block a sibling file in the same push,
// same isolation principle as api-routes-sync.spec.ts's own sibling test.
test("pushes a valid hook file even when a sibling file in the same push is rejected", async ({
	projectDir,
	runCli,
}) => {
	const hooksDir = join(projectDir, "hooks");
	mkdirSync(hooksDir, { recursive: true });
	writeFileSync(
		join(hooksDir, "broken.php"),
		"<?php\n\ndeclare(strict_types=1);\n\nfinal class Broken\n{\n    public function run(): void\n    {\n        $x = 1\n    }\n}\n",
	);
	// Named distinctly from api-routes-sync.spec.ts's own "Good" class: unlike an api/ file
	// (only ever require()d while handling a REST request), a hooks/ file is require()d on
	// every single request once pushed (see HookLoader), so its class name is effectively
	// reserved site-wide, including against unrelated api/ e2e fixtures sharing this same
	// disposable WordPress instance.
	writeFileSync(
		join(hooksDir, "good.php"),
		"<?php\n\ndeclare(strict_types=1);\n\nuse Loopress\\Hooks\\Attribute\\Action;\n\nfinal class HookPushGood\n{\n    #[Action('init')]\n    public function run(): void\n    {\n    }\n}\n",
	);

	const pushResult = await runCli(["hook", "push"]);
	expect(pushResult.exitCode).not.toBe(0);

	const listResult = await runCli(["hook", "list"]);
	expect(listResult.exitCode).toBe(0);
	expect(listResult.stdout).toContain("good");
});

// The happy path: a valid hook file, once pushed, is actually require()d at boot and its
// callback runs (HookLoader), the site does not fatal from that require, and `hook pull`
// brings the file back byte-for-byte. Unique class/slug per run: a hooks/ file is loaded on
// every request, so a reused class name collides with the previous run's still-warm copy.
test("pushes a valid hook that runs on the site, then pulls it back identically", async ({
	projectDir,
	request,
	runCli,
	wp,
}) => {
	const stamp = Date.now();
	const slug = `e2e-hook-${stamp}`;
	const hooksDir = join(projectDir, "hooks");
	const source = [
		"<?php",
		"",
		"declare(strict_types=1);",
		"",
		"use Loopress\\Hooks\\Attribute\\Action;",
		"",
		`final class E2eHook${stamp}`,
		"{",
		"    #[Action('rest_api_init')]",
		"    public function run(): void",
		"    {",
		`        register_rest_route('e2e-hook/v1', '/ping-${stamp}', [`,
		"            'methods' => 'GET',",
		"            'permission_callback' => '__return_true',",
		`            'callback' => static fn () => ['ran' => true, 'slug' => '${slug}'],`,
		"        ]);",
		"    }",
		"}",
		"",
	].join("\n");
	mkdirSync(hooksDir, { recursive: true });
	writeFileSync(join(hooksDir, `${slug}.php`), source);

	const pushResult = await runCli(["hook", "push"]);
	expect(pushResult.exitCode, pushResult.stderr).toBe(0);

	const listResult = await runCli(["hook", "list"]);
	expect(listResult.exitCode).toBe(0);
	expect(listResult.stdout).toContain(slug);

	// The route only exists if the hook file was require()d at boot and its rest_api_init
	// callback actually ran; a 200 here also means that boot-time require did not fatal.
	const response = await request.get(`${wp.url}/wp-json/e2e-hook/v1/ping-${stamp}`);
	expect(response.status()).toBe(200);
	expect(await response.json()).toEqual({ ran: true, slug });

	rmSync(join(hooksDir, `${slug}.php`));
	const pullResult = await runCli(["hook", "pull"]);
	expect(pullResult.exitCode, pullResult.stderr).toBe(0);
	expect(readFileSync(join(hooksDir, `${slug}.php`), "utf8")).toBe(source);
});
