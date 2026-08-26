/**
 * PKCE session-code handoff (base44-dev/apper#17216 §5.2).
 *
 * The invariant under test throughout: the SDK OFFERS version=2 and the
 * backend DECIDES. Whatever the server answers with — a session_code or the
 * legacy ?access_token= (including after a backend rollback) — the SDK
 * digests it. Legacy is never deprecated, and the SDK never opts in to a
 * handoff this browser can't complete.
 */
import { describe, test, expect, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import nock from "nock";
import {
  prepareSessionHandoffKickoff,
  redeemSessionHandoffCode,
  PKCE_VERIFIER_STORAGE_KEY,
} from "../../src/utils/session-handoff.ts";
import { createClient } from "../../src/index.ts";

const APP_ORIGIN = "https://myapp.example.com";
const SERVER_URL = "https://api.base44.com";
const APP_ID = "test-app-id";
const EXCHANGE_PATH = `/api/apps/${APP_ID}/auth/sso/exchange`;
const VERIFIER_43 = "v".repeat(43);

function makeStorage(overrides: Record<string, unknown> = {}) {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    ...overrides,
  };
}

function installWindow({
  search = "",
  pathname = "/Dashboard",
  hash = "",
  sessionStorage = makeStorage(),
  localStorage = makeStorage(),
  iframe = false,
}: {
  search?: string;
  pathname?: string;
  hash?: string;
  sessionStorage?: unknown;
  localStorage?: ReturnType<typeof makeStorage>;
  iframe?: boolean;
} = {}) {
  const win: any = {
    location: {
      search,
      pathname,
      hash,
      origin: APP_ORIGIN,
      href: `${APP_ORIGIN}${pathname}${search}${hash}`,
    },
    history: { replaceState: vi.fn() },
    sessionStorage,
    localStorage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    open: vi.fn(() => null),
    screenX: 0,
    screenY: 0,
    outerWidth: 1024,
    outerHeight: 768,
  };
  win.parent = iframe ? {} : win;
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", {
    title: "Test",
    referrer: "",
    visibilityState: "visible",
  });
  vi.stubGlobal("localStorage", localStorage);
  return win;
}

function stubFetch(impl?: (...args: any[]) => Promise<any>) {
  const fetchMock = vi.fn(
    impl ??
      (async () => ({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "fresh-jwt" }),
      }))
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sha256Base64Url(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

function handoffSearch({
  code = "the-code",
  path = EXCHANGE_PATH,
  extra = "",
}: { code?: string; path?: string; extra?: string } = {}) {
  return `?session_code=${code}&session_exchange_path=${encodeURIComponent(path)}${extra}`;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  nock.cleanAll();
});

describe("prepareSessionHandoffKickoff", () => {
  test("returns version=2 + S256 challenge and stores the verifier", async () => {
    const win = installWindow();

    const suffix = await prepareSessionHandoffKickoff();

    expect(suffix).toMatch(
      /^&version=2&code_challenge=[A-Za-z0-9_-]{43}&code_challenge_method=S256$/
    );
    const verifier = win.sessionStorage.getItem(PKCE_VERIFIER_STORAGE_KEY);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // RFC 7636: challenge = BASE64URL(SHA256(ASCII(verifier))), and the
    // verifier itself never appears in the kickoff URL.
    const challenge = suffix!.match(/code_challenge=([A-Za-z0-9_-]{43})/)![1];
    expect(challenge).toBe(sha256Base64Url(verifier!));
    expect(suffix).not.toContain(verifier);
  });

  test("generates a fresh verifier for every kickoff", async () => {
    const win = installWindow();
    await prepareSessionHandoffKickoff();
    const first = win.sessionStorage.getItem(PKCE_VERIFIER_STORAGE_KEY);
    await prepareSessionHandoffKickoff();
    const second = win.sessionStorage.getItem(PKCE_VERIFIER_STORAGE_KEY);
    expect(first).not.toBe(second);
  });

  test("fails open to legacy when sessionStorage access throws", async () => {
    installWindow({
      sessionStorage: {
        setItem: () => {
          throw new Error("sandboxed");
        },
      },
    });
    expect(await prepareSessionHandoffKickoff()).toBeNull();
  });

  test("fails open when the verifier write does not stick", async () => {
    // Some lockdown modes drop writes silently instead of throwing; an
    // opted-in login whose verifier is gone could never redeem its code.
    installWindow({
      sessionStorage: makeStorage({ setItem: () => {} }),
    });
    expect(await prepareSessionHandoffKickoff()).toBeNull();
  });

  test("fails open when WebCrypto is unavailable", async () => {
    installWindow();
    vi.stubGlobal("crypto", {});
    expect(await prepareSessionHandoffKickoff()).toBeNull();
  });

  test("fails open outside a browser", async () => {
    expect(await prepareSessionHandoffKickoff()).toBeNull();
  });
});

describe("loginWithProvider kickoff negotiation", () => {
  function makeAuthClient() {
    // Created windowless (node) so the browser bootstrap in createClient is
    // inert; loginWithProvider reads window at call time.
    return createClient({
      serverUrl: SERVER_URL,
      appId: APP_ID,
      appBaseUrl: APP_ORIGIN,
    });
  }

  test("sso kickoff appends version=2 + challenge when PKCE is available", async () => {
    const client = makeAuthClient();
    const win = installWindow();

    client.auth.loginWithProvider("sso", "/dashboard");

    await vi.waitFor(() =>
      expect(win.location.href).toContain(`/api/apps/${APP_ID}/auth/sso/login?`)
    );
    expect(win.location.href).toContain("&version=2&code_challenge=");
    expect(win.location.href).toContain("&code_challenge_method=S256");
    const challenge = win.location.href.match(
      /code_challenge=([A-Za-z0-9_-]{43})/
    )![1];
    expect(challenge).toBe(
      sha256Base64Url(win.sessionStorage.getItem(PKCE_VERIFIER_STORAGE_KEY)!)
    );
  });

  test("sso kickoff falls back to the exact legacy URL when PKCE prep fails", async () => {
    const client = makeAuthClient();
    const win = installWindow({
      sessionStorage: makeStorage({ setItem: () => {} }),
    });

    client.auth.loginWithProvider("sso", "/dashboard");

    await vi.waitFor(() =>
      expect(win.location.href).toContain(`/api/apps/${APP_ID}/auth/sso/login?`)
    );
    expect(win.location.href).not.toContain("version=2");
    expect(win.location.href).not.toContain("code_challenge");
  });

  test("non-sso providers keep the synchronous legacy kickoff", () => {
    const client = makeAuthClient();
    const win = installWindow();

    client.auth.loginWithProvider("google", "/dashboard");

    expect(win.location.href).toContain("/api/apps/auth/login?");
    expect(win.location.href).not.toContain("version=2");
    expect(win.location.href).not.toContain("code_challenge");
  });

  test("popup (iframe) kickoff stays on the exact legacy URL", () => {
    // Popups deliver via postMessage and never redeem a code; the backend
    // skips the code mint for them. Their kickoff must stay byte-identical.
    const client = makeAuthClient();
    const win = installWindow({ iframe: true });

    client.auth.loginWithProvider("sso", "/dashboard");

    expect(win.open).toHaveBeenCalledOnce();
    const popupUrl = win.open.mock.calls[0][0] as string;
    expect(popupUrl).toContain("popup_origin=");
    expect(popupUrl).not.toContain("version=2");
    expect(popupUrl).not.toContain("code_challenge");
  });
});

describe("redeemSessionHandoffCode", () => {
  test("returns null synchronously when no handoff params are present", () => {
    installWindow({ search: "?foo=bar" });
    const fetchMock = stubFetch();
    expect(redeemSessionHandoffCode()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("legacy access_token wins outright when both are present (rollback safety)", () => {
    installWindow({
      search: handoffSearch({ extra: "&access_token=legacy-jwt" }),
    });
    const fetchMock = stubFetch();
    expect(redeemSessionHandoffCode()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("exchanges the code with the verifier and strips the one-time params", async () => {
    const win = installWindow({
      search: handoffSearch({ extra: "&is_new_user=true" }),
    });
    win.sessionStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, VERIFIER_43);
    const fetchMock = stubFetch();

    const result = await redeemSessionHandoffCode();

    expect(result).toBe("fresh-jwt");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${APP_ORIGIN}${EXCHANGE_PATH}`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      code: "the-code",
      code_verifier: VERIFIER_43,
    });
    // One-time params stripped immediately; is_new_user stays in the URL
    // exactly as the legacy flow leaves it.
    const newUrl = win.history.replaceState.mock.calls[0][2];
    expect(newUrl).toBe("/Dashboard?is_new_user=true");
    // The verifier is one-shot.
    expect(win.sessionStorage.getItem(PKCE_VERIFIER_STORAGE_KEY)).toBeNull();
  });

  test("missing verifier (different-tab login) still attempts and fails closed", async () => {
    installWindow({ search: handoffSearch() });
    const fetchMock = stubFetch(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(redeemSessionHandoffCode()).resolves.toBeNull();

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ code: "the-code" });
    // The named failure mode is called out, not a mystery 401.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("different browser tab")
    );
  });

  test("a failed exchange resolves null without throwing", async () => {
    const win = installWindow({ search: handoffSearch() });
    win.sessionStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, VERIFIER_43);
    stubFetch(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    }));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(redeemSessionHandoffCode()).resolves.toBeNull();
    expect(error).toHaveBeenCalled();
  });

  test("cross-origin session_exchange_path is rejected without a request", async () => {
    installWindow({
      search: handoffSearch({ path: "https://evil.example.net/steal" }),
    });
    const fetchMock = stubFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(redeemSessionHandoffCode()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("protocol-relative session_exchange_path is rejected without a request", async () => {
    installWindow({
      search: handoffSearch({ path: "//evil.example.net/steal" }),
    });
    const fetchMock = stubFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(redeemSessionHandoffCode()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("network failure resolves null (never rejects)", async () => {
    const win = installWindow({ search: handoffSearch() });
    win.sessionStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, VERIFIER_43);
    stubFetch(async () => {
      throw new Error("network down");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(redeemSessionHandoffCode()).resolves.toBeNull();
  });

  test("a success response without an access_token resolves null", async () => {
    installWindow({ search: handoffSearch() });
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    }));

    await expect(redeemSessionHandoffCode()).resolves.toBeNull();
  });
});

describe("createClient session-code bootstrap", () => {
  function allowAnalytics() {
    nock(SERVER_URL).persist().post(/analytics/).reply(200, {});
  }

  test("redeems the code and authenticates subsequent requests", async () => {
    allowAnalytics();
    const win = installWindow({ search: handoffSearch({ code: "code1" }) });
    win.sessionStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, VERIFIER_43);
    stubFetch();

    const client = createClient({
      serverUrl: SERVER_URL,
      appId: APP_ID,
      appBaseUrl: APP_ORIGIN,
    });

    await vi.waitFor(() =>
      expect(win.localStorage.getItem("base44_access_token")).toBe("fresh-jwt")
    );

    const scope = nock(SERVER_URL)
      .get(`/api/apps/${APP_ID}/entities/User/me`)
      .matchHeader("Authorization", "Bearer fresh-jwt")
      .reply(200, { id: "u1" });
    await client.auth.me();
    expect(scope.isDone()).toBe(true);
    client.cleanup();
  });

  test("backend rollback: legacy ?access_token= is captured as before, no exchange attempted", () => {
    allowAnalytics();
    const win = installWindow({ search: "?access_token=legacy-jwt" });
    const fetchMock = stubFetch();

    const client = createClient({
      serverUrl: SERVER_URL,
      appId: APP_ID,
      appBaseUrl: APP_ORIGIN,
    });

    expect(win.localStorage.getItem("base44_access_token")).toBe("legacy-jwt");
    expect(fetchMock).not.toHaveBeenCalled();
    client.cleanup();
  });

  test("a failed exchange falls back to a stored token", async () => {
    allowAnalytics();
    const win = installWindow({ search: handoffSearch() });
    win.localStorage.setItem("base44_access_token", "stored-jwt");
    const fetchMock = stubFetch(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    }));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const client = createClient({
      serverUrl: SERVER_URL,
      appId: APP_ID,
      appBaseUrl: APP_ORIGIN,
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const scope = nock(SERVER_URL)
      .get(`/api/apps/${APP_ID}/entities/User/me`)
      .matchHeader("Authorization", "Bearer stored-jwt")
      .reply(200, { id: "u1" });
    await vi.waitFor(async () => {
      await client.auth.me();
    });
    expect(scope.isDone()).toBe(true);
    client.cleanup();
  });

  test("requiresAuth waits for the pending exchange instead of bouncing to login", async () => {
    allowAnalytics();
    const win = installWindow({ search: handoffSearch() });
    win.sessionStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, VERIFIER_43);

    let releaseExchange!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseExchange = resolve;
    });
    stubFetch(async () => {
      await gate;
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "fresh-jwt" }),
      };
    });
    const probe = nock(SERVER_URL)
      .get(`/api/apps/${APP_ID}/entities/User/me`)
      .matchHeader("Authorization", "Bearer fresh-jwt")
      .reply(200, { id: "u1" });

    const client = createClient({
      serverUrl: SERVER_URL,
      appId: APP_ID,
      appBaseUrl: APP_ORIGIN,
      requiresAuth: true,
    });

    // Let the deferred auth probe fire while the exchange is still pending:
    // it must wait, not redirect to login (that would abandon the exchange
    // and mint a fresh code every round — a login loop).
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(win.location.href).not.toContain("/login?from_url=");

    releaseExchange();
    await vi.waitFor(() => expect(probe.isDone()).toBe(true));
    expect(win.location.href).not.toContain("/login?from_url=");
    client.cleanup();
  });
});
