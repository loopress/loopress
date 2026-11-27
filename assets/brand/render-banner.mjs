// Renders assets/brand/banner.html to the social image and the WordPress.org banners.
// Usage: node assets/brand/render-banner.mjs   (from the repo root)
// Outputs: website/public/og-image.png, documentation/public/og-image.png (1200x630),
//          wordpress-plugin/.wordpress-org/banner-772x250.png and banner-1544x500.png.
// The headline is the tagline of website/src/pages/index.astro: edit banner.html when it changes.
import { chromium } from "@playwright/test";
import { copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const page_url = pathToFileURL(resolve(here, "banner.html")).href;

const jobs = [
  { hash: "og", width: 1200, height: 630, scale: 1, out: "website/public/og-image.png" },
  { hash: "wporg", width: 772, height: 250, scale: 1, out: "wordpress-plugin/.wordpress-org/banner-772x250.png" },
  { hash: "wporg", width: 772, height: 250, scale: 2, out: "wordpress-plugin/.wordpress-org/banner-1544x500.png" },
];

const browser = await chromium.launch();
for (const job of jobs) {
  const context = await browser.newContext({
    viewport: { width: job.width, height: job.height },
    deviceScaleFactor: job.scale,
  });
  const page = await context.newPage();
  await page.goto(`${page_url}#${job.hash}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(root, job.out) });
  await context.close();
}
await browser.close();

copyFileSync(resolve(root, "website/public/og-image.png"), resolve(root, "documentation/public/og-image.png"));
