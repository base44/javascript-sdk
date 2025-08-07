import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.js", "tests/**/*.test.ts"],
    typecheck: {
      enabled: true,
      include: ["tests/**/*.test-d.ts"],
      tsconfig: "./tsconfig.tests.json",
    },
    coverage: {
      reporter: ["text", "json", "html"],
    },
    testTimeout: 30000,
  },
  esbuild: {
    target: "esnext",
    loader: "ts",
  },
});
