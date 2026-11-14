// Run after `astro build`: every prerendered page must have a canonical equal to its og:url
// and to its sitemap <loc>, all with a trailing slash.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../.vercel/output/static", import.meta.url).pathname;
const sitemap = readFileSync(join(root, "sitemap-0.xml"), "utf8");
const locs = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));

const pages = readdirSync(root, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith("index.html") && !f.startsWith("_astro"));

const errors = [];
for (const file of pages) {
  const html = readFileSync(join(root, file), "utf8");
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  const ogUrl = html.match(/property="og:url" content="([^"]*)"/)?.[1];
  const route = "/" + relative(".", file).replace(/index\.html$/, "");
  const expected = `https://loopress.dev${route}`;
  if (canonical !== expected) errors.push(`${file}: canonical ${canonical} != ${expected}`);
  if (ogUrl !== canonical) errors.push(`${file}: og:url ${ogUrl} != canonical ${canonical}`);
  if (!locs.has(expected)) errors.push(`${file}: ${expected} not in the sitemap`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`canonical OK on ${pages.length} prerendered pages`);
