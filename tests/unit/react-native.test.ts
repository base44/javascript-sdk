import { afterEach, describe, expect, test, vi } from "vitest";

// React Native defines a limited `window` polyfill but has no `document`,
// `localStorage`, or `window.location`. The SDK must import, construct, and
// make requests there without touching those globals. Analytics is disabled.
describe("React Native environment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function stubReactNativeGlobals() {
    // `window` exists but is a bare object: no `location`, no `addEventListener`,
    // no `localStorage`.
    vi.stubGlobal("window", {});
    // `document` is not defined on React Native.
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("localStorage", undefined);
  }

  test("importing and constructing the client does not throw", async () => {
    stubReactNativeGlobals();
    // Re-import so module-load code (e.g. the analytics shared-state factory)
    // is evaluated against the React Native globals.
    vi.resetModules();
    const { createClient } = await import("../../src/index.ts");

    const client = createClient({
      serverUrl: "https://api.base44.com",
      appId: "test-app-id",
    });

    expect(client.analytics).toBeDefined();
    expect(() => client.cleanup()).not.toThrow();
  });

  test("analytics.track is a safe noop (no document access)", async () => {
    stubReactNativeGlobals();
    vi.resetModules();
    const { createClient } = await import("../../src/index.ts");

    const client = createClient({
      serverUrl: "https://api.base44.com",
      appId: "test-app-id",
    });

    expect(() =>
      client.analytics.track({ eventName: "test-event" })
    ).not.toThrow();

    client.cleanup();
  });

  test("isReactNative reflects the window-without-document environment", async () => {
    stubReactNativeGlobals();
    vi.resetModules();
    const { isReactNative, isNode } = await import("../../src/utils/common.ts");

    expect(isNode).toBe(false);
    expect(isReactNative).toBe(true);
  });
});
