import importPlugin from "eslint-plugin-import";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["**/dist/**", "**/docs/**"],
  },
  {
    files: ["packages/*/src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      "import/extensions": ["error", "always", { ignorePackages: true }],
    },
  },
];
