import nestjsTyped from "@darraghor/eslint-plugin-nestjs-typed";
import tseslint from "typescript-eslint";
import node from "./node.js";

export default tseslint.config(...node, nestjsTyped.configs.flatRecommended);
