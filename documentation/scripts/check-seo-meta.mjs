// Build assertion: every indexable page has a title of 30 to 65 chars, a description of 110 to 165
// chars, and neither is shared with another page. Usage: node scripts/check-seo-meta.mjs <build dir>
// [--max-only]. With --max-only the minimums are not enforced (the docs reference pages are short
// on purpose), only the maximums and the duplicates.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const dir = process.argv[2];
const maxOnly = process.argv.includes("--max-only");
if (!dir) {
	console.error("usage: check-seo-meta.mjs <build dir>");
	process.exit(2);
}

const TITLE = [maxOnly ? 0 : 30, 65];
const DESCRIPTION = [maxOnly ? 0 : 110, 165];

function* htmlFiles(d) {
	for (const name of readdirSync(d)) {
		const p = join(d, name);
		if (statSync(p).isDirectory()) yield* htmlFiles(p);
		else if (name.endsWith(".html")) yield p;
	}
}

const decode = (s) =>
	s
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'")
		.replaceAll("&#x27;", "'")
		.replaceAll("&amp;", "&");
const meta = (html, re) => {
	const m = html.match(re);
	return m ? decode(m[1]).trim() : "";
};

const problems = [];
const seen = { title: new Map(), description: new Map() };

for (const file of htmlFiles(dir)) {
	const page = relative(dir, file);
	const html = readFileSync(file, "utf8");
	if (/<meta[^>]+http-equiv=["']refresh/i.test(html)) continue;
	if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) continue;
	if (page === "404.html") continue;

	const fields = {
		title: meta(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
		description: meta(html, /<meta\s+name="description"\s+content="([^"]*)"/i) ||
			meta(html, /<meta\s+content="([^"]*)"\s+name="description"/i),
	};
	for (const [key, [min, max]] of [["title", TITLE], ["description", DESCRIPTION]]) {
		const value = fields[key];
		if (value.length < min || value.length > max) {
			problems.push(`${page}: ${key} is ${value.length} chars (want ${min} to ${max}): ${value}`);
		}
		if (value) {
			const first = seen[key].get(value);
			if (first) problems.push(`${page}: ${key} duplicates ${first}`);
			else seen[key].set(value, page);
		}
	}
}

if (problems.length) {
	console.error(problems.join("\n"));
	console.error(`\n${problems.length} SEO title/description problem(s)`);
	process.exit(1);
}
