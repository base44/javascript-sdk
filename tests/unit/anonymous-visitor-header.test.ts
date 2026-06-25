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
});
