import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(async ({ command }) => {
  const plugins: PluginOption[] = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({ server: { entry: "server" } }),
    react(),
  ];

  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    plugins.push(...nitro({ preset: "vercel" }));
  }

  return { plugins };
});
