import importPlugin from "eslint-plugin-import";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.ts", "platform-src/**/*.ts", "examples/platform-server.ts"],
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
