import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import sitemap from "@astrojs/sitemap";
import { createRequire } from "module";
import { copyFileSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { fileURLToPath } from "url";

import indexnow from "astro-indexnow";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(import.meta.url);
const zodRoot = resolve(require.resolve("zod/package.json"), "..");
const logoBlack = require.resolve("@loopress/assets/loopress-logo-black.svg");

/** @returns {import('astro').AstroIntegration} */
function loopressFavicon() {
  return {
    name: "loopress-favicon",
    hooks: {
      "astro:config:setup": () => {
        mkdirSync(join(__dirname, "public"), { recursive: true });
        copyFileSync(logoBlack, join(__dirname, "public", "favicon.svg"));
      },
    },
  };
}

export default defineConfig({
  site: "https://loopress.dev",
  integrations: [
    loopressFavicon(),
    react(),
    sitemap(),
    indexnow({
      key: "3fae972a4f0945b29ae38c454a9f4e81",
      enabled: true,
    }),
  ],
  adapter: vercel(),
  output: "server",
  server: {
    port: 5432,
  },
  vite: {
    plugins: [tailwindcss(), tsConfigPaths({ projects: ["./tsconfig.json"] })],
    resolve: {
      alias: {
        "zod/v4/core": resolve(zodRoot, "v4/core/index.js"),
      },
    },
    server: {
      fs: {
        allow: [".."],
      },
    },
  },
});
