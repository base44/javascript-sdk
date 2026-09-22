import { afterEach, describe, expect, test, vi } from "vitest";
import {
  exchangeEmbedToken,
  isFramed,
  showEmbedSessionEnded,
  takeEmbedTokenFromUrl,
} from "../../src/utils/embed-session.ts";

const fakeStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
};

// `framed` puts the window inside a parent frame, as an embedded app is.
const fakeWindow = ({
  url,
  sessionStorage = fakeStorage(),
  framed = true,
}: {
  url: string;
  sessionStorage?: ReturnType<typeof fakeStorage> | { getItem(): never; setItem(): never };
  framed?: boolean;
}) => {
  const windowRef: any = {
    location: { href: url },
    history: {
      state: { router: "state" },
      replaceState: (state: unknown, _title: string, nextUrl: string) => {
        windowRef.history.state = state;
        windowRef.location.href = nextUrl;
      },
    },
    sessionStorage,
  };
  windowRef.self = windowRef;
  windowRef.top = framed ? {} : windowRef;
  return windowRef;
};

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const refusedResponse = (status = 400) =>
  ({ ok: false, status, json: async () => ({ error: "invalid_grant" }) }) as unknown as Response;

// Answers with the responses in order, repeating the last one.
const countingFetch = (...responses: Response[]) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return responses[Math.min(calls.length, responses.length) - 1];
  }) as unknown as typeof fetch & { calls: typeof calls };
  fetchImpl.calls = calls;
  return fetchImpl;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("takeEmbedTokenFromUrl", () => {
  test("takes the one-time token off the URL and leaves the other params in place", () => {
    const windowRef = fakeWindow({ url: "https://app.base44.app/orders?ott=the-ott&tab=open" });
    vi.stubGlobal("window", windowRef);

    expect(takeEmbedTokenFromUrl()).toBe("the-ott");
    expect(windowRef.location.href).toBe("https://app.base44.app/orders?tab=open");
    expect(windowRef.history.state).toEqual({ router: "state" });
  });

  // Dropping the token here would leave `?ott=` on the URL for getAccessToken
  // to hand back, and an app would send a one-time token as a bearer.
  test("still returns the token when the URL cannot be rewritten", () => {
    const windowRef = fakeWindow({ url: "https://app.base44.app/orders?ott=the-ott" });
    windowRef.history.replaceState = () => {
      throw new Error("SecurityError: replaceState is not available here");
    };
    vi.stubGlobal("window", windowRef);

    expect(takeEmbedTokenFromUrl()).toBe("the-ott");
  });

  test("leaves a URL without a one-time token untouched", () => {
    const windowRef = fakeWindow({ url: "https://app.base44.app/orders?tab=open" });
    vi.stubGlobal("window", windowRef);

    expect(takeEmbedTokenFromUrl()).toBeNull();
    expect(windowRef.location.href).toBe("https://app.base44.app/orders?tab=open");
  });

  test("returns null outside a browser", () => {
    vi.stubGlobal("window", undefined);
    expect(takeEmbedTokenFromUrl()).toBeNull();
  });

  // Nobody redeems one in a top-level tab, so it is not reported there — but it
  // still comes off the URL rather than sitting in the address bar.
  test("strips the token but reports nothing in a top-level tab", () => {
    const windowRef = fakeWindow({
      url: "https://app.base44.app/orders?ott=the-ott&tab=open",
      framed: false,
    });
    vi.stubGlobal("window", windowRef);

    expect(takeEmbedTokenFromUrl()).toBeNull();
    expect(windowRef.location.href).toBe("https://app.base44.app/orders?tab=open");
  });
});

describe("isFramed", () => {
  test("is true inside a frame", () => {
    vi.stubGlobal("window", fakeWindow({ url: "https://app.base44.app/" }));
    expect(isFramed()).toBe(true);
  });

  test("is false in a top-level tab", () => {
    vi.stubGlobal("window", fakeWindow({ url: "https://app.base44.app/", framed: false }));
    expect(isFramed()).toBe(false);
  });

  test("is false outside a browser", () => {
    vi.stubGlobal("window", undefined);
    expect(isFramed()).toBe(false);
  });

});

describe("exchangeEmbedToken", () => {
  const params = { serverUrl: "https://api.base44.test", appId: "app-1", ott: "the-ott" };

  test("posts the RFC 8693 grant to the app's exchange endpoint", async () => {
    const fetchImpl = countingFetch(okResponse({ access_token: "session-token", token_type: "Bearer" }));

    expect(await exchangeEmbedToken({ ...params, fetchImpl })).toBe("session-token");
    expect(fetchImpl.calls).toHaveLength(1);
    expect(fetchImpl.calls[0].url).toBe("https://api.base44.test/api/apps/app-1/auth/embed/token");
    expect(fetchImpl.calls[0].init.method).toBe("POST");
    expect(Object.fromEntries(fetchImpl.calls[0].init.body as URLSearchParams)).toEqual({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: "the-ott",
      subject_token_type: "urn:base44:params:oauth:token-type:embed-ott",
    });
  });

  test("resolves to null when the exchange is refused", async () => {
    const fetchImpl = countingFetch(refusedResponse());
    expect(await exchangeEmbedToken({ ...params, fetchImpl })).toBeNull();
    expect(fetchImpl.calls).toHaveLength(1);
  });

  test("retries once when rate-limited, since the token is still valid", async () => {
    vi.useFakeTimers();
    const fetchImpl = countingFetch(refusedResponse(429), okResponse({ access_token: "session-token" }));

    const pending = exchangeEmbedToken({ ...params, fetchImpl });
    await vi.advanceTimersByTimeAsync(1000);

    expect(await pending).toBe("session-token");
    expect(fetchImpl.calls).toHaveLength(2);
  });

  test("gives up after a second rate-limit response", async () => {
    vi.useFakeTimers();
    const fetchImpl = countingFetch(refusedResponse(429));

    const pending = exchangeEmbedToken({ ...params, fetchImpl });
    await vi.advanceTimersByTimeAsync(1000);

    expect(await pending).toBeNull();
    expect(fetchImpl.calls).toHaveLength(2);
  });

  test("resolves to null instead of throwing when the request fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    expect(await exchangeEmbedToken({ ...params, fetchImpl })).toBeNull();
  });
});

describe("showEmbedSessionEnded", () => {
  const fakeDocument = () => {
    const appended: any[] = [];
    const elements: Record<string, any> = {};
    const createElement = (tag: string) => {
      const el: any = { tag, style: {}, children: [] as any[], attributes: {} as Record<string, string> };
      el.setAttribute = (name: string, value: string) => (el.attributes[name] = value);
      el.append = (...nodes: any[]) => el.children.push(...nodes);
      Object.defineProperty(el, "id", {
        set(value: string) {
          elements[value] = el;
        },
      });
      return el;
    };
    return {
      appended,
      createElement,
      getElementById: (id: string) => elements[id] ?? null,
      body: { append: (...nodes: any[]) => appended.push(...nodes) },
    };
  };

  test("covers the page with a session-ended notice, once", () => {
    const documentRef = fakeDocument();
    vi.stubGlobal("document", documentRef);

    showEmbedSessionEnded();
    showEmbedSessionEnded();

    expect(documentRef.appended).toHaveLength(1);
    const [overlay] = documentRef.appended;
    expect(overlay.attributes.role).toBe("alert");
    const card = overlay.children.at(-1);
    const texts = card.children.map((c: any) => c.textContent);
    expect(texts).toEqual([
      "Session ended",
      "Reload this page in your browser to start a new session.",
    ]);
  });

  // The app it covers can be in either theme, and the reader can switch while
  // the notice is up, so the colors are a stylesheet rather than fixed values.
  test("follows the reader's color scheme", () => {
    const documentRef = fakeDocument();
    vi.stubGlobal("document", documentRef);

    showEmbedSessionEnded();

    const [overlay] = documentRef.appended;
    expect(overlay.style.cssText).toContain("background:var(--b44-bg)");
    const sheet = overlay.children.find((c: any) => c.tag === "style");
    expect(sheet.textContent).toContain("prefers-color-scheme:dark");
  });

  test("does nothing outside a browser", () => {
    vi.stubGlobal("document", undefined);
    expect(() => showEmbedSessionEnded()).not.toThrow();
  });
});
