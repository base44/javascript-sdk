import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getOrCreateAnonymousVisitorId } from "../../src/utils/anon-visitor.ts";
import { createAxiosClient } from "../../src/utils/axios-client.ts";

function makeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
}

function stubBrowser(localStorage = makeLocalStorage()) {
  vi.stubGlobal("window", {
    location: { href: "https://my-app.base44.app/" },
    localStorage,
  });
  return localStorage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getOrCreateAnonymousVisitorId", () => {
  test("returns null outside the browser (no window)", () => {
    expect(getOrCreateAnonymousVisitorId()).toBeNull();
  });

  test("mints, persists, and is stable across calls", () => {
    const ls = stubBrowser();
    const first = getOrCreateAnonymousVisitorId();
    expect(first).toBeTruthy();
    expect(ls.getItem("base44_anonymous_visitor_id")).toBe(first);
    expect(getOrCreateAnonymousVisitorId()).toBe(first);
  });

  test("starts a fresh id after storage is cleared", () => {
    const ls = stubBrowser();
    const first = getOrCreateAnonymousVisitorId();
    ls.clear();
    const second = getOrCreateAnonymousVisitorId();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
  });
});

describe("createAxiosClient anonymous-visitor header", () => {
  async function captureRequestHeaders(token?: string) {
    const client = createAxiosClient({ baseURL: "https://api", token });
    let captured: any;
    client.defaults.adapter = async (config) => {
      captured = config;
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    };
    await client.get("/conversations");
    return captured.headers;
  }

  test("attaches X-Base44-Anonymous-Id when there is no token", async () => {
    stubBrowser();
    const headers = await captureRequestHeaders(undefined);
    expect(headers.get("X-Base44-Anonymous-Id")).toBeTruthy();
    expect(headers.get("Authorization")).toBeFalsy();
  });

  test("does NOT attach the anonymous header when authenticated", async () => {
    stubBrowser();
    const headers = await captureRequestHeaders("a-real-token");
    expect(headers.get("X-Base44-Anonymous-Id")).toBeFalsy();
    expect(headers.get("Authorization")).toBe("Bearer a-real-token");
  });
});
