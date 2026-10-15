import { describe, expect, test } from "vitest";
import { createPlatformServer } from "../../src/server/index.js";

describe("createPlatformServer", () => {
  test("creates a frozen client without side effects", () => {
    expect(Object.isFrozen(createPlatformServer({ serverUrl: "https://api.example.test", apiKey: "key" }))).toBe(true);
  });

  test("rejects a serverUrl that is not a bare HTTP(S) origin", () => {
    for (const serverUrl of ["ftp://example.test", "https://example.test/path", "https://u:p@example.test", "https://example.test?x=1"]) {
      expect(() => createPlatformServer({ serverUrl, apiKey: "key" })).toThrow(TypeError);
    }
  });

  test("requires an apiKey", () => {
    expect(() => createPlatformServer({ serverUrl: "https://example.test", apiKey: "" })).toThrow(TypeError);
  });
});
