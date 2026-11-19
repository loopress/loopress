// Build assertion: every JSON-LD block on every page parses. With --docs, every indexable page
// also has a BreadcrumbList; without it (the website), /faq has a FAQPage with one Question per
// question rendered on the page. Usage: node ../scripts/check-structured-data.mjs <build dir> [--docs]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const dir = process.argv[2];
const docs = process.argv.includes("--docs");
if (!dir) {
	console.error("usage: check-structured-data.mjs <build dir> [--docs]");
	process.exit(2);
}

function* htmlFiles(d) {
	for (const name of readdirSync(d)) {
		const p = join(d, name);
		if (statSync(p).isDirectory()) yield* htmlFiles(p);
		else if (name.endsWith(".html")) yield p;
	}
}

// Every node of a JSON-LD block, top level and @graph, as a flat list.
const nodes = (data) => (Array.isArray(data) ? data : [data]).flatMap((d) => (d["@graph"] ? d["@graph"] : [d]));

const problems = [];
let faqChecked = false;

for (const file of htmlFiles(dir)) {
	const page = relative(dir, file);
	const html = readFileSync(file, "utf8");
	if (/<meta[^>]+http-equiv=["']refresh/i.test(html)) continue;

	const things = [];
	// Every <script> first, then its type, so attribute order and quoting do not hide a block.
	for (const [, attrs, json] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
		if (!/\btype\s*=\s*["']?application\/ld\+json["']?/i.test(attrs)) continue;
		try {
			things.push(...nodes(JSON.parse(json)));
		} catch (error) {
			problems.push(`${page}: JSON-LD does not parse: ${error.message}`);
		}
	}
	const types = things.map((t) => t["@type"]);

	const indexable = page !== "404.html" && !/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html);
	if (docs && indexable && !types.includes("BreadcrumbList")) problems.push(`${page}: no BreadcrumbList`);

	if (!docs && (page === "faq.html" || page === "faq/index.html")) {
		faqChecked = true;
		const faq = things.find((t) => t["@type"] === "FAQPage");
		const questions = (html.match(/<dt[\s>]/g) ?? []).length;
		if (!faq) problems.push(`${page}: no FAQPage`);
		else if (faq.mainEntity?.length !== questions) {
			problems.push(`${page}: FAQPage has ${faq.mainEntity?.length ?? 0} questions, the page ${questions}`);
		}
	}
}

if (!docs && !faqChecked) problems.push("faq page not found in the build");

if (problems.length) {
	console.error(problems.join("\n"));
	console.error(`\n${problems.length} structured data problem(s)`);
	process.exit(1);
}
