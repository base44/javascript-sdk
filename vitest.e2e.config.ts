import { defineConfig } from "vitest/config";

// These tests exercise real APIs and can create/delete data. Never run them as
// part of npm test or with MSW enabled. Require an explicit operator opt-in.
if (process.env.BASE44_RUN_E2E !== "true") {
  throw new Error(
    "Live E2E tests require BASE44_RUN_E2E=true and dedicated test credentials. See tests/README.md.",
  );
}
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 30000,
    setupFiles: ["./tests/setup.e2e.js"],
    include: ["tests/e2e/**/*.test.js", "tests/e2e/**/*.test.ts"],
  },
});
