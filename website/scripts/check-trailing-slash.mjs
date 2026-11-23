// Build assertion: URLs have no trailing slash (home excepted). For each page of the static output,
// the canonical equals og:url and a sitemap <loc>; no internal link ends with "/" but the home.
// Usage: node scripts/check-trailing-slash.mjs <build dir>
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const dir = process.argv[2];
if (!dir) {
	console.error("usage: check-trailing-slash.mjs <build dir>");
	process.exit(2);
}
const ORIGIN = "https://loopress.dev";

function* htmlFiles(d) {
	for (const name of readdirSync(d)) {
		const p = join(d, name);
		if (statSync(p).isDirectory()) yield* htmlFiles(p);
		else if (name.endsWith(".html")) yield p;
	}
}

const locs = new Set();
for (const name of readdirSync(dir).filter((n) => /^sitemap-\d+\.xml$/.test(n))) {
	for (const m of readFileSync(join(dir, name), "utf8").matchAll(/<loc>([^<]*)<\/loc>/g)) locs.add(m[1]);
}

const problems = [];
for (const loc of locs) {
	if (loc !== `${ORIGIN}/` && loc.endsWith("/")) problems.push(`sitemap: ${loc} ends with a slash`);
}
for (const file of htmlFiles(dir)) {
	const page = relative(dir, file);
	if (page === "404.html") continue;
	const html = readFileSync(file, "utf8");
	if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) continue;
	const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
	const ogUrl = html.match(/<meta property="og:url" content="([^"]*)"/)?.[1];
	if (!canonical) problems.push(`${page}: no canonical`);
	else {
		if (canonical !== `${ORIGIN}/` && canonical.endsWith("/")) problems.push(`${page}: canonical ${canonical} ends with a slash`);
		if (canonical !== ogUrl) problems.push(`${page}: canonical ${canonical} differs from og:url ${ogUrl}`);
		if (!locs.has(canonical)) problems.push(`${page}: canonical ${canonical} is not in the sitemap`);
	}
	for (const m of html.matchAll(/href="(\/[^"]*\/)"/g)) {
		if (m[1] !== "/") problems.push(`${page}: internal link ${m[1]} ends with a slash`);
	}
}

if (problems.length) {
	console.error(problems.join("\n"));
	console.error(`\n${problems.length} trailing slash problem(s)`);
	process.exit(1);
}
