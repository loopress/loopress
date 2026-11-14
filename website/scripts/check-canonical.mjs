// Run after `astro build`: every prerendered page must have a canonical equal to its og:url
// and to its sitemap <loc>, all with a trailing slash.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../.vercel/output/static", import.meta.url));
const sitemap = readFileSync(join(root, "sitemap-0.xml"), "utf8");
const locs = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));

const pages = readdirSync(root, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith("index.html") && !f.startsWith("_astro"));

// Attributes of the first real <tag> matching `test`, ignoring HTML comments.
function findTag(html, name, test) {
  for (const [tag] of html.matchAll(new RegExp(`<${name}\\s[^>]*>`, "gi"))) {
    const attrs = Object.fromEntries(
      [...tag.matchAll(/([a-zA-Z:-]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1].toLowerCase(), m[2]]),
    );
    if (test(attrs)) return attrs;
  }
  return undefined;
}

// Repeat until stable so removing a comment cannot assemble a new one, then drop any unterminated opener.
function stripComments(input) {
  let html = input;
  let previous;
  do {
    previous = html;
    html = html.replace(/<!--[\s\S]*?-->/g, "");
  } while (html !== previous);
  return html.replaceAll("<!--", "");
}

const errors = [];
for (const file of pages) {
  const html = stripComments(readFileSync(join(root, file), "utf8"));
  const canonical = findTag(html, "link", (a) => a.rel === "canonical")?.href;
  const ogUrl = findTag(html, "meta", (a) => a.property === "og:url")?.content;
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
