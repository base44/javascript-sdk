import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createClient } from "../../src/index.ts";

const appId = "test-app-id";
const origin = "https://my-app.base44.app";

function makeLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
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

function stubBrowser(storage = makeLocalStorage()) {
  vi.stubGlobal("document", { referrer: "", visibilityState: "visible" });
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    history: { replaceState: vi.fn() },
    location: {
      href: `${origin}/dashboard`,
      origin,
      pathname: "/dashboard",
      search: "",
    },
    localStorage: storage,
  });
  vi.stubGlobal("localStorage", storage);
}

const createTestClient = (token?: string) =>
  createClient({
    serverUrl: "",
    appId,
    token,
    analytics: { enabled: false },
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls[0];
  return { url, init, headers: new Headers(init.headers) };
};

describe("fetchWithAuth", () => {
  test("attaches the user's token to a same-origin path", async () => {
    stubBrowser();
    const base44 = createTestClient("user-token");

    await base44.fetchWithAuth("/api/orders");

    const { url, headers } = lastCall();
    expect(url).toBe(`${origin}/api/orders`);
    expect(headers.get("Authorization")).toBe("Bearer user-token");
  });

  test("reads the token from local storage when the client was created without one", async () => {
    stubBrowser(makeLocalStorage({ base44_access_token: "stored-token" }));
    const base44 = createTestClient();

    await base44.fetchWithAuth("/api/orders");

    expect(lastCall().headers.get("Authorization")).toBe("Bearer stored-token");
  });

  test("uses the token set after login", async () => {
    stubBrowser();
    const base44 = createTestClient("old-token");

    base44.setToken("new-token");
    await base44.fetchWithAuth("/api/orders");

    expect(lastCall().headers.get("Authorization")).toBe("Bearer new-token");
  });

  test("sends no auth header after logout", async () => {
    stubBrowser();
    const base44 = createTestClient("user-token");

    base44.auth.logout();
    // logout() navigates the page; the test keeps the stubbed location usable.
    (globalThis as any).window.location.href = `${origin}/dashboard`;
    await base44.fetchWithAuth("/api/orders");

    expect(lastCall().headers.get("Authorization")).toBeNull();
  });

  test("sends no auth header when no user is signed in", async () => {
    stubBrowser();
    const base44 = createTestClient();

    await base44.fetchWithAuth("/api/public");

    expect(lastCall().headers.get("Authorization")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("forwards init options and keeps a caller-set Authorization header", async () => {
    stubBrowser();
    const base44 = createTestClient("user-token");

    await base44.fetchWithAuth("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer caller-token",
      },
      body: JSON.stringify({ productId: "abc" }),
    });

    const { init, headers } = lastCall();
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ productId: "abc" }));
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer caller-token");
  });

  test("resolves a path relative to the current page", async () => {
    stubBrowser();
    const base44 = createTestClient("user-token");

    await base44.fetchWithAuth("api/orders");

    expect(lastCall().url).toBe(`${origin}/api/orders`);
  });

  test.each([
    ["an absolute URL", "https://evil.example/steal"],
    ["a protocol-relative path", "//evil.example/steal"],
    ["a backslash-prefixed path", "/\\evil.example/steal"],
    ["an absolute URL on another port", `${origin}:8443/api/orders`],
  ])("rejects %s", async (_label, path) => {
    stubBrowser();
    const base44 = createTestClient("user-token");

    await expect(base44.fetchWithAuth(path)).rejects.toThrow(
      /only sends requests to your app's own origin/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects an empty path", async () => {
    stubBrowser();
    const base44 = createTestClient("user-token");

    await expect(base44.fetchWithAuth("")).rejects.toThrow(/requires a path/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("throws outside the browser", async () => {
    const base44 = createTestClient("user-token");

    await expect(base44.fetchWithAuth("/api/orders")).rejects.toThrow(
      /only available in the browser/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
