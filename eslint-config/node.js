import pluginN from "eslint-plugin-n";
import globals from "globals";
import tseslint from "typescript-eslint";
import base from "./base.js";

export default tseslint.config(
  ...base,
  pluginN.configs["flat/recommended-module"],
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: globals.node,
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
      },
    },
  }
);
