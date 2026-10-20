import { describe, expect, test } from "vitest";
import { createPlatformServer } from "../../src/server/index.js";

describe("createPlatformServer", () => {
  test("creates a frozen client with frozen modules, without side effects", () => {
    const platform = createPlatformServer();
    expect(Object.isFrozen(platform)).toBe(true);
    expect(Object.isFrozen(platform.webhooks)).toBe(true);
  });
});
