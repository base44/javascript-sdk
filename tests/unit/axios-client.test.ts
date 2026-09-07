import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

// The Activity Monitor postMessage path only runs inside an iframe. The unit
// test env is "node", so force isInIFrame on and provide a window.
vi.mock("../../src/utils/common.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/utils/common.js")>(
      "../../src/utils/common.js"
    );
  return { ...actual, isInIFrame: true };
});

import { createAxiosClient, toSerializable } from "../../src/utils/axios-client.ts";

describe("axios-client Activity Monitor logging", () => {
  let posted: Array<Record<string, any>>;
  let originalWindow: any;

  beforeEach(() => {
    posted = [];
    originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      location: { href: "https://docker-pr-12518.velino.org/" },
      // Faithfully simulate the browser: postMessage runs the structured clone
      // algorithm and throws on non-cloneable payloads.
      parent: {
        postMessage: vi.fn((message: any) => {
          structuredClone(message);
          posted.push(message);
        }),
      },
    };
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  const runWithResponse = async (responseData: unknown) => {
    const client = createAxiosClient({
      baseURL: "https://docker-pr-12518.velino.org/api/apps/app-id/functions",
    });
    client.defaults.adapter = async (config) => ({
      data: responseData,
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    });
    await client.post("/searchClients", { q: "acme" });
  };

  test("delivers api-request-end (200) even when the response body is not cloneable", async () => {
    // A function field makes the raw postMessage throw DataCloneError.
    await runWithResponse({ ok: true, retry: () => {} });

    const ends = posted.filter((m) => m.type === "api-request-end");
    expect(ends).toHaveLength(1);
    expect(ends[0].data.statusCode).toBe(200);
  });

  test("start and end share the same requestId", async () => {
    await runWithResponse({ ok: true });

    const start = posted.find((m) => m.type === "api-request-start");
    const end = posted.find((m) => m.type === "api-request-end");
    expect(start?.requestId).toBeTruthy();
    expect(end?.requestId).toBe(start?.requestId);
  });

  test("preserves a cloneable response body unchanged", async () => {
    await runWithResponse({ ok: true, rows: [1, 2, 3] });

    const end = posted.find((m) => m.type === "api-request-end");
    expect(end?.data.response).toEqual({ ok: true, rows: [1, 2, 3] });
  });
});

describe("toSerializable", () => {
  const cloneable = (v: unknown) =>
    expect(() => structuredClone(v)).not.toThrow();

  test("passes primitives through", () => {
    expect(toSerializable("x")).toBe("x");
    expect(toSerializable(42)).toBe(42);
    expect(toSerializable(true)).toBe(true);
    expect(toSerializable(null)).toBe(null);
  });

  test("strips function fields and yields a cloneable object", () => {
    const result = toSerializable({ ok: true, retry: () => {} });
    expect(result).toEqual({ ok: true });
    cloneable(result);
  });

  test("collapses circular references to a cloneable value", () => {
    const circular: any = { a: 1 };
    circular.self = circular;
    cloneable(toSerializable(circular));
  });
});
