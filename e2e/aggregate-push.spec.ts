import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./helpers/environment.js";

// `lps push` fans out to the resource-specific `push` commands in dependency order (plugins,
// composer, ACF, api, hooks, forms, snippets...), each run non-interactively with --yes and
// the default environment. Every other spec in this suite drives one resource directly (`lps
// snippet push`, `lps api push`, ...); none of them exercise the aggregate command itself, so a
// regression in its own orchestration, an unhandled resource, a dropped --yes/--env, would have
// no coverage. This project deliberately leaves `plugins`, ACF, hooks, forms and Global Styles
// unconfigured and never runs `composer init`, the common case for a project that doesn't manage either through Loopress, so the run
// also has to prove an unconfigured resource is skipped rather than stopping the run (a real
// failure does stop it, so later resources never land on a site missing what they depend on).
test("lps push runs every resource, pushing what's local and skipping what isn't configured", async ({
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
	// snippets/ exists but is empty: an empty resource directory counts as unused, so it is
	// skipped like a missing one rather than pushed.
	mkdirSync(join(projectDir, "snippets"), { recursive: true });
	// `snippet push` refuses an empty directory while the site holds snippets (it would delete
	// them all), and other specs leave some behind: start from a site with none.
	const existing = JSON.parse(
		(await runCli(["snippet", "list", "--json"])).stdout,
	) as Array<{ id: number }>;
	for (const { id } of existing) {
		expect((await runCli(["snippet", "rm", String(id), "--yes"])).exitCode).toBe(0);
	}

	const push = await runCli(["push"]);

	// Unconfigured is skipped, not failed: plugins and composer, ACF and forms without their
	// directory, hooks without a hooks directory, Global Styles without a tracked file.
	expect(push.exitCode).toBe(0);
	for (const label of ["plugins", "composer", "ACF", "hooks", "forms", "Global Styles", "snippets"]) {
		expect(push.stdout).toContain(`→ ${label}: not configured, skipped`);
	}

	// Every other resource ran and succeeded, in the documented order.
	const succeeded = ["API routes"];
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
