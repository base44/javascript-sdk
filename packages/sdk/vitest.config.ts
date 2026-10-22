import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Vitest's Node conditions would resolve the package's own
    // `#build-commit-source` import to the dist fallback; tests run the source.
    alias: {
      "#build-commit-source": fileURLToPath(
        new URL("./src/utils/build-commit-source.ts", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.js", "tests/**/*.test.ts"],
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
