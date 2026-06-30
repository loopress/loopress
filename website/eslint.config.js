import reactConfig from "@loopress/eslint-config/react";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";

export default [
  { ignores: [".astro", ".vercel", "dist"] },
  ...reactConfig,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
];
