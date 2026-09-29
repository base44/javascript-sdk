import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    include: ["tests/unit/**/*.test.js", "tests/unit/**/*.test.ts"],
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
