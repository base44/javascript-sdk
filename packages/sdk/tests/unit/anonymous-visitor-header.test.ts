import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createAxiosClient } from "../../src/utils/axios-client.ts";
import { getAnalyticsSessionId } from "../../src/modules/analytics.ts";

const ANALYTICS_SESSION_ID_KEY = "base44_analytics_session_id";

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

beforeEach(() => {
  const localStorage = makeLocalStorage();
  vi.stubGlobal("window", {
    location: { href: "https://my-app.base44.app/" },
    localStorage,
  });
  vi.stubGlobal("localStorage", localStorage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function captureRequestHeaders(
  token?: string,
  { tokenSetAfterConstruction }: { tokenSetAfterConstruction?: string } = {}
) {
  const client = createAxiosClient({ baseURL: "https://api", token });
  // Mirrors the common browser path: auth.setToken() applies the Authorization
  // header on the client's defaults after the client has already been built.
  if (tokenSetAfterConstruction) {
    client.defaults.headers.common[
      "Authorization"
    ] = `Bearer ${tokenSetAfterConstruction}`;
  }
  let captured: any;
  client.defaults.adapter = async (config) => {
    captured = config;
    return { data: {}, status: 200, statusText: "OK", headers: {}, config };
  };
  await client.get("/conversations");
  return captured.headers;
}

describe("anonymous visitor header", () => {
  test("unauthenticated client sends X-Base44-Anonymous-Id", async () => {
    const headers = await captureRequestHeaders(undefined);
    expect(headers.get("X-Base44-Anonymous-Id")).toBeTruthy();
    expect(headers.get("Authorization")).toBeFalsy();
  });

  test("header value is the persisted analytics session id (unified identity)", async () => {
    const headers = await captureRequestHeaders(undefined);
    const sessionId = getAnalyticsSessionId();
    expect(headers.get("X-Base44-Anonymous-Id")).toBe(sessionId);
    expect(
      (globalThis as any).localStorage.getItem(ANALYTICS_SESSION_ID_KEY)
    ).toBe(sessionId);
  });

  test("authenticated client sends Authorization, not the anonymous header", async () => {
    const headers = await captureRequestHeaders("a-real-token");
    expect(headers.get("X-Base44-Anonymous-Id")).toBeFalsy();
    expect(headers.get("Authorization")).toBe("Bearer a-real-token");
  });

  test("token set after construction (browser setToken path) omits the anonymous header", async () => {
    const headers = await captureRequestHeaders(undefined, {
      tokenSetAfterConstruction: "a-real-token",
    });
    expect(headers.get("Authorization")).toBe("Bearer a-real-token");
    expect(headers.get("X-Base44-Anonymous-Id")).toBeFalsy();
  });

  // When localStorage can't persist the id, it must at least stay stable
  // within the process — not a new "visitor" per request.
  describe("without persistent storage", () => {
    // Fresh import so the memo starts empty regardless of earlier tests.
    async function freshGetAnalyticsSessionId() {
      vi.resetModules();
      const { getAnalyticsSessionId: fresh } = await import(
        "../../src/modules/analytics.ts"
      );
      return fresh;
    }

    test("React Native (window without localStorage): the id is memoized", async () => {
      vi.stubGlobal("window", {});
      vi.stubGlobal("localStorage", undefined);
      const getId = await freshGetAnalyticsSessionId();
      const first = getId();
      expect(first).toBeTruthy();
      expect(getId()).toBe(first);
    });

    test("Node (no window): the id is memoized", async () => {
      vi.stubGlobal("window", undefined);
      vi.stubGlobal("localStorage", undefined);
      const getId = await freshGetAnalyticsSessionId();
      const first = getId();
      expect(first).toBeTruthy();
      expect(getId()).toBe(first);
    });
  });
});
