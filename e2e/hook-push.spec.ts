import { mkdirSync, writeFileSync } from "node:fs";
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
	writeFileSync(
		join(hooksDir, "good.php"),
		"<?php\n\ndeclare(strict_types=1);\n\nuse Loopress\\Hooks\\Attribute\\Action;\n\nfinal class Good\n{\n    #[Action('init')]\n    public function run(): void\n    {\n    }\n}\n",
	);

	const pushResult = await runCli(["hook", "push"]);
	expect(pushResult.exitCode).not.toBe(0);

	const listResult = await runCli(["hook", "list"]);
	expect(listResult.exitCode).toBe(0);
	expect(listResult.stdout).toContain("good");
});
