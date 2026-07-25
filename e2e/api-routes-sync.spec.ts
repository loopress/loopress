import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, unwrap } from "./helpers/environment.js";

// Regression test: a route file with a valid `declare(strict_types=1);` line but otherwise
// broken PHP syntax used to be accepted and written anyway (push_file() only checked for the
// declare line, never that the PHP actually parses). `api push` reported success and `api
// list` showed the file as present, while the route itself 404d at request time — the parse
// error only ever reached the server's own PHP error log, invisible to both CLI commands.
test("rejects a route file with invalid PHP syntax instead of silently accepting it", async ({
	projectDir,
	runCli,
}) => {
	const apiDir = join(projectDir, "api");
	mkdirSync(apiDir, { recursive: true });
	writeFileSync(
		join(apiDir, "broken.php"),
		[
			"<?php",
			"",
			"declare(strict_types=1);",
			"",
			"final class Broken",
			"{",
			"    public function get(WP_REST_Request $request): array",
			"    {",
			"        return ['ok' => true]", // missing semicolon: genuine syntax error
			"    }",
			"}",
			"",
		].join("\n"),
	);

	const pushResult = await runCli(["api", "push"]);
	expect(pushResult.exitCode).not.toBe(0);
	expect(unwrap(pushResult.stderr)).toContain("syntax");

	const listResult = await runCli(["api", "list"]);
	expect(listResult.exitCode).toBe(0);
	expect(listResult.stdout).not.toContain("broken");
});

// A file failing for one reason (bad syntax) must not block a sibling file in the same push,
// same isolation principle as snippet-sync.spec.ts's malformed-sidecar test.
test("pushes a valid route file even when a sibling file in the same push is rejected", async ({
	projectDir,
	runCli,
}) => {
	const apiDir = join(projectDir, "api");
	mkdirSync(apiDir, { recursive: true });
	writeFileSync(
		join(apiDir, "broken.php"),
		"<?php\n\ndeclare(strict_types=1);\n\nfinal class Broken\n{\n    public function get(WP_REST_Request $request): array\n    {\n        return ['ok' => true]\n    }\n}\n",
	);
	writeFileSync(
		join(apiDir, "good.php"),
		"<?php\n\ndeclare(strict_types=1);\n\nfinal class Good\n{\n    public function get(WP_REST_Request $request): array\n    {\n        return ['ok' => true];\n    }\n}\n",
	);

	const pushResult = await runCli(["api", "push"]);
	expect(pushResult.exitCode).not.toBe(0);

	const listResult = await runCli(["api", "list"]);
	expect(listResult.exitCode).toBe(0);
	expect(listResult.stdout).toContain("good");
});
