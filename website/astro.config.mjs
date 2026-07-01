import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import sitemap from "@astrojs/sitemap";
import { createRequire } from "module";
import { resolve } from "path";

const require = createRequire(import.meta.url);
const zodRoot = resolve(require.resolve("zod/package.json"), "..");

export default defineConfig({
  site: "https://loopress.dev",
  integrations: [react(), sitemap()],
  adapter: vercel(),
  output: "server",
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
