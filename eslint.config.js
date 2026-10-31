import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/**", "shots/**", "node_modules/**", "audit/**", "release/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["electron/**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
);
