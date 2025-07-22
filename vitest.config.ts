import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.js"],
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
