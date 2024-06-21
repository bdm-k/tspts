// @ts-check
import eslint from "@eslint/js";
import tsEslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";

export default tsEslint.config(
  { ignores: ["**/dist/**/*", "**/.temp/**/*"] },
  {
    plugins: { "unused-imports": unusedImports },
    rules: { "unused-imports/no-unused-imports": "error" },
  },
  eslint.configs.recommended,
  ...tsEslint.configs.recommended
);
