import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, unwrap } from "./helpers/environment.js";

// `lps push` fans out to eight resource-specific `push` commands in dependency order (plugins,
// composer, ACF, api, hooks, forms, SEO, snippets), each run non-interactively with --yes and
// the active environment. Every other spec in this suite drives one resource directly (`lps
// snippet push`, `lps api push`, ...); none of them exercise the aggregate command itself, so a
// regression in its own orchestration, an unhandled resource, a dropped --yes/--env, a failure
// in one resource silently swallowing the rest, would have no coverage. This project deliberately
// leaves `plugins` unconfigured and never runs `composer init`, the common case for a project
// that doesn't manage either through Loopress, so the run also has to prove a real per-resource
// failure doesn't stop or hide the resources that do have something to push.
test("lps push runs every resource, pushing what's local and reporting exactly what failed", async ({
	projectDir,
	request,
	runCli,
	wp,
}) => {
	// A unique route per run: reusing a name leaves the previous run's compiled class in the
	// server's OPcache, serving stale bytecode after this file is gone.
	const stamp = Date.now();
	const routeName = `e2e-aggregate-push-${stamp}`;
	const apiDir = join(projectDir, "api");
	mkdirSync(apiDir, { recursive: true });
	writeFileSync(
		join(apiDir, `${routeName}.php`),
		[
			"<?php",
			"",
			"declare(strict_types=1);",
			"",
			"use Loopress\\Api\\Attribute\\Permission;",
			"",
			"#[Permission(public: true)]",
			`final class E2eAggregatePush${stamp}`,
			"{",
			"    public function get(): array",
			"    {",
			`        return ['ok' => true, 'route' => '${routeName}'];`,
			"    }",
			"}",
			"",
		].join("\n"),
	);
	// snippets/ exists but is empty: proves an empty resource succeeds as a no-op rather than
	// failing the run (unlike plugins/composer below, which have nothing to be empty *of*).
	mkdirSync(join(projectDir, "snippets"), { recursive: true });

	const push = await runCli(["push"]);

	// plugins and composer are unconfigured: the run must still fail overall (a real failure
	// must not go unreported)...
	expect(push.exitCode).not.toBe(0);
	expect(unwrap(push.stderr)).toContain("2 resources failed to push");
	expect(push.stdout).toContain("✗ plugins failed:");
	expect(push.stdout).toContain("✗ composer failed:");

	// ...but every other resource still ran and succeeded, in the documented order, none of
	// them skipped because an earlier one failed.
	const succeeded = ["ACF", "API routes", "hooks", "forms", "SEO", "snippets"];
	for (const label of succeeded) {
		expect(push.stdout).toContain(`✓ ${label} pushed`);
	}
	const order = succeeded.map((label) => push.stdout.indexOf(`✓ ${label} pushed`));
	expect(order).toEqual([...order].sort((a, b) => a - b));

	// The one resource with real local content actually landed and is serving, not just
	// reported as pushed by the CLI.
	const response = await request.get(`${wp.url}/wp-json/loopress-api/v1/${routeName}`);
	expect(response.status()).toBe(200);
	expect(await response.json()).toEqual({ ok: true, route: routeName });
});
