import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createClient, createClientFromRequest } from "../../src/index.ts";

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
    expect(url).toBe("/api/orders");
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

  test("passes the path through untouched", async () => {
    stubBrowser();
    const base44 = createTestClient("user-token");

    await base44.fetchWithAuth("/api/orders?status=open#top");

    expect(lastCall().url).toBe("/api/orders?status=open#top");
  });

  test.each([
    ["an absolute URL", "https://evil.example/steal"],
    ["a protocol-relative path", "//evil.example/steal"],
    ["a backslash-prefixed path", "/\\evil.example/steal"],
    ["an absolute URL on another port", `${origin}:8443/api/orders`],
    ["a bare relative path", "api/orders"],
    // A URL parser drops tabs/newlines and trims leading space, so these read
    // as "//evil.example" by the time the request is built.
    ["a tab-split protocol-relative path", "/\t/evil.example/steal"],
    ["a newline-split protocol-relative path", "/\n/evil.example/steal"],
    ["a space-padded protocol-relative path", "  //evil.example/steal"],
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

  test("works with no document, as in a server route", async () => {
    // No stubBrowser(): window is undefined here, the way it is on a worker.
    const base44 = createTestClient("caller-token");

    await base44.fetchWithAuth("/api/orders");

    const { url, headers } = lastCall();
    expect(url).toBe("/api/orders");
    expect(headers.get("Authorization")).toBe("Bearer caller-token");
  });

  test("rejects another origin with no document too", async () => {
    const base44 = createTestClient("caller-token");

    await expect(
      base44.fetchWithAuth("https://evil.example/steal")
    ).rejects.toThrow(/only sends requests to your app's own origin/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const apiUrl = "https://base44.app";

/** The header set the platform puts on a fullstack worker request. */
function inboundRequest(
  overrides: Record<string, string | undefined> = {}
): Request {
  const headers: Record<string, string> = {
    Authorization: "Bearer caller-user-token",
    "Base44-Service-Authorization": "Bearer service-credential",
    "Base44-App-Id": appId,
    "Base44-Api-Url": apiUrl,
    "Base44-Functions-Version": "draft",
    "Base44-State": "signed-state-jwt",
    "X-Data-Env": "dev",
    host: "my-app.base44.app",
    cookie: "session=irrelevant",
  };
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) delete headers[name];
    else headers[name] = value;
  }
  return new Request(`${origin}/page`, { headers });
}

describe("fetchWithAuth from a server route", () => {
  test("sends every header createClientFromRequest reads, so the callee rebuilds the same client", async () => {
    const base44 = createClientFromRequest(inboundRequest());

    await base44.fetchWithAuth("/api/items", { fetch: fetchMock });

    const { url, headers } = lastCall();
    expect(url).toBe("/api/items");
    expect(headers.get("Authorization")).toBe("Bearer caller-user-token");
    expect(headers.get("Base44-App-Id")).toBe(appId);
    expect(headers.get("Base44-Api-Url")).toBe(apiUrl);
    expect(headers.get("Base44-Functions-Version")).toBe("draft");
    expect(headers.get("Base44-State")).toBe("signed-state-jwt");
    expect(headers.get("X-Data-Env")).toBe("dev");
  });

  test("carries the service credential, so asServiceRole works in the callee", async () => {
    const base44 = createClientFromRequest(inboundRequest());

    await base44.fetchWithAuth("/api/items", { fetch: fetchMock });

    expect(lastCall().headers.get("Base44-Service-Authorization")).toBe(
      "Bearer service-credential"
    );
  });

  test("does not forward host, which would repoint the sub-request's origin", async () => {
    const base44 = createClientFromRequest(inboundRequest());

    await base44.fetchWithAuth("/api/items", { fetch: fetchMock });

    expect(lastCall().headers.has("host")).toBe(false);
  });

  test("forwards nothing from the inbound request beyond that set", async () => {
    const base44 = createClientFromRequest(inboundRequest());

    await base44.fetchWithAuth("/api/items", { fetch: fetchMock });

    expect(lastCall().headers.has("cookie")).toBe(false);
  });

  test("stays anonymous when the caller is", async () => {
    const base44 = createClientFromRequest(
      inboundRequest({ Authorization: undefined })
    );

    await base44.fetchWithAuth("/api/items", { fetch: fetchMock });

    const { headers } = lastCall();
    expect(headers.has("Authorization")).toBe(false);
    expect(headers.get("Base44-Service-Authorization")).toBe(
      "Bearer service-credential"
    );
  });

  test("omits headers the inbound request did not carry", async () => {
    const base44 = createClientFromRequest(
      inboundRequest({
        "Base44-State": undefined,
        "X-Data-Env": undefined,
        "Base44-Functions-Version": undefined,
      })
    );

    await base44.fetchWithAuth("/api/items", { fetch: fetchMock });

    const { headers } = lastCall();
    expect(headers.has("Base44-State")).toBe(false);
    expect(headers.has("X-Data-Env")).toBe(false);
    expect(headers.has("Base44-Functions-Version")).toBe(false);
  });

  test("renders as anonymous when the caller drops Authorization on purpose", async () => {
    const base44 = createClientFromRequest(inboundRequest());

    await base44.fetchWithAuth("/api/items", {
      fetch: fetchMock,
      headers: { Authorization: "" },
    });

    expect(lastCall().headers.get("Authorization")).toBe("");
  });

  test("uses the given transport and does not pass it on as request init", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const base44 = createClientFromRequest(inboundRequest());

    await base44.fetchWithAuth("/api/items", { fetch: fetchMock });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(lastCall().init).not.toHaveProperty("fetch");
  });

  test("refuses to send the app's credentials to another origin", async () => {
    const base44 = createClientFromRequest(inboundRequest());

    await expect(
      base44.fetchWithAuth("https://evil.example/steal", { fetch: fetchMock })
    ).rejects.toThrow(/only sends requests to your app's own origin/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchWithAuth in a browser", () => {
  // The reason one method can serve both: a browser client is built without a
  // serviceToken, so there is no service credential for it to send. This is
  // what makes the wider header set safe to apply everywhere.
  test("sends no service credential, having none", async () => {
    stubBrowser();
    const base44 = createTestClient("user-token");

    await base44.fetchWithAuth("/api/orders");

    const { headers } = lastCall();
    expect(headers.get("Authorization")).toBe("Bearer user-token");
    expect(headers.has("Base44-Service-Authorization")).toBe(false);
  });
});
