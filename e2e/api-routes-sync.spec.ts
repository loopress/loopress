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

// Regression test (QA 7th-pass CRITICAL finding): permission() returning a callable, the
// convention before api-permission-direct-callback, used to be treated as truthy and thus
// granted access, since WP core's dispatch only denies on a strict `=== false` return and a
// Closure is never `=== false`. A route explicitly written to deny everyone must still deny
// everyone after the fix (RouteLoader::wrapCallableMethod() now requires a real bool).
test("a route file still using the pre-direct-callback permission() convention denies access instead of granting it", async ({
	projectDir,
	request,
	runCli,
	wp,
}) => {
	const apiDir = join(projectDir, "api");
	mkdirSync(apiDir, { recursive: true });
	writeFileSync(
		join(apiDir, "qa-old-style-deny.php"),
		[
			"<?php",
			"",
			"declare(strict_types=1);",
			"",
			"final class QaOldStyleDeny",
			"{",
			"    public function get(): array",
			"    {",
			"        return ['should_never_be_reached' => true];",
			"    }",
			"",
			"    // Pre-api-permission-direct-callback convention: permission() returned a callable",
			"    // to be invoked later, rather than being the permission_callback itself.",
			"    public function permission(): callable",
			"    {",
			"        return fn(): bool => false;",
			"    }",
			"}",
			"",
		].join("\n"),
	);

	const pushResult = await runCli(["api", "push"]);
	expect(pushResult.exitCode, pushResult.stderr).toBe(0);

	// No Authorization header: this is the real anonymous-request scenario the bug exposed.
	const response = await request.get(`${wp.url}/wp-json/loopress-api/v1/qa-old-style-deny`);

	// 401, not just "not 200": rest_authorization_required_code() returns 401 for an
	// anonymous caller, 403 only once already logged in, so this also pins the exact
	// WP_Error code core's dispatch() assigns on a strict `=== false` permission result.
	expect(response.status()).toBe(401);
	expect(((await response.json()) as {code: string}).code).toBe("rest_forbidden");
	expect(await response.text()).not.toContain("should_never_be_reached");
});

// Regression test (QA 7th-pass MEDIUM finding): a dynamic segment name starting with a digit
// makes preg_match()'s named group silently fail (see RouteLoader::DYNAMIC_SEGMENT_PATTERN's
// own comment), so both the CLI and the server reject it. The CLI's client-side check now
// mirrors this exact rule (cli/src/commands/api/push.ts's FILENAME_PATTERN) and can no longer
// reach the server with this input, so this asserts the server-side contract directly instead,
// the same rule the CLI's own pre-check exists to mirror.
test("rejects a dynamic segment name starting with a digit", async ({request, wp}) => {
	const response = await request.put(`${wp.url}/wp-json/loopress/v1/api-files`, {
		data: {
			content:
				"<?php\n\ndeclare(strict_types=1);\n\nfinal class Badseg_1Bad\n{\n    public function get(): array { return []; }\n}\n",
			filename: "badseg/[1bad]",
		},
		headers: {Authorization: `Basic ${Buffer.from(`${wp.username}:${wp.appPassword}`).toString("base64")}`},
	});

	expect(response.status()).toBe(400);
});
