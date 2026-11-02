import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createClient } from "../../src/index.ts";
import { getSharedInstance } from "../../src/utils/sharedInstance.ts";
import { getAnalyticsSessionId } from "../../src/modules/analytics.ts";

const SESSION_ID_KEY = "base44_analytics_session_id";

const requests: string[] = [];

vi.mock("../../src/utils/axios-client.ts", () => ({
  createAxiosClient: vi.fn().mockImplementation(() => ({
    defaults: { headers: { common: {} } },
    request: vi.fn(async (config: { url: string }) => {
      requests.push(config.url);
      return {};
    }),
    post: vi.fn(async (url: string) => {
      requests.push(url);
      return {};
    }),
  })),
}));

type ConsentState = {
  analyticsMode: string | null;
  consentGranted: boolean;
  isWatchingConsent: boolean;
  listeners: unknown[];
};
const consentState = getSharedInstance<ConsentState>(
  "analytics-consent",
  () => ({} as ConsentState)
);
const analyticsState = getSharedInstance("analytics", () => ({})) as {
  requestsQueue: unknown[];
  isProcessing: boolean;
  wasInitializationTracked: boolean;
  fallbackSessionId: string | null;
  sessionContext: unknown;
  config: Record<string, unknown>;
};

let storage: Map<string, string>;
let consentListener: { grant: () => void; revoke: () => void } | null;
let client: ReturnType<typeof createClient>;

// What the page looks like: the server's meta tag and Base44's consent listener.
function loadPage(mode: string | null) {
  consentState.analyticsMode = mode;
  consentState.consentGranted = mode !== "consent";
  consentState.isWatchingConsent = false;
  consentState.listeners = [];
  client = createClient({ serverUrl: "https://api", appId: "app-1" });
}

const analyticsRequests = () => requests.filter((url) => url.includes("/analytics/"));

beforeEach(() => {
  vi.useFakeTimers();
  requests.length = 0;
  storage = new Map();
  consentListener = null;
  const localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  };
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("document", { referrer: "", visibilityState: "visible" });
  vi.stubGlobal("window", {
    localStorage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    location: { origin: "https://app.example", pathname: "/", search: "", href: "https://app.example/" },
    __b44Consent: {
      on: (category: string, grant: () => void, revoke: () => void) => {
        if (category === "analytics_storage") consentListener = { grant, revoke };
      },
    },
  });
  Object.assign(analyticsState, {
    requestsQueue: [],
    isProcessing: false,
    wasInitializationTracked: false,
    fallbackSessionId: null,
    sessionContext: null,
  });
  analyticsState.config = { ...analyticsState.config, enabled: true, heartBeatInterval: undefined };
});

afterEach(() => {
  client.cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("analytics follows the owner's choice and the visitor's consent", () => {
  test("consent: nothing is stored or sent before a grant", async () => {
    loadPage("consent");
    client.analytics.track({ eventName: "click" });
    await client.appLogs.logUserInApp("home");
    getAnalyticsSessionId();
    await vi.advanceTimersByTimeAsync(5000);

    expect(storage.has(SESSION_ID_KEY)).toBe(false);
    expect(requests).toEqual([]);
  });

  test("consent: a grant starts tracking, a revoke stops it and removes the id", async () => {
    loadPage("consent");
    const idBeforeGrant = getAnalyticsSessionId();

    consentListener!.grant();
    await vi.advanceTimersByTimeAsync(0);
    expect(analyticsRequests()).toHaveLength(1);
    expect(storage.get(SESSION_ID_KEY)).toBe(idBeforeGrant);

    consentListener!.revoke();
    requests.length = 0;
    client.analytics.track({ eventName: "after-revoke" });
    await client.appLogs.logUserInApp("home");
    await vi.advanceTimersByTimeAsync(5000);

    expect(storage.has(SESSION_ID_KEY)).toBe(false);
    expect(requests).toEqual([]);
    // The tab keeps one id, so an anonymous agent chat keeps its owner.
    expect(getAnalyticsSessionId()).toBe(idBeforeGrant);
    expect(storage.has(SESSION_ID_KEY)).toBe(false);
  });

  test("off: nothing is stored or sent, whatever the consent", async () => {
    loadPage("off");
    consentListener?.grant();
    client.analytics.track({ eventName: "click" });
    await client.appLogs.logUserInApp("home");
    getAnalyticsSessionId();
    await vi.advanceTimersByTimeAsync(5000);

    expect(storage.has(SESSION_ID_KEY)).toBe(false);
    expect(requests).toEqual([]);
  });

  test("on: tracks from load until the visitor declines", async () => {
    loadPage("on");
    await vi.advanceTimersByTimeAsync(0);
    expect(analyticsRequests()).toHaveLength(1);
    expect(storage.has(SESSION_ID_KEY)).toBe(true);

    consentListener!.revoke();
    requests.length = 0;
    client.analytics.track({ eventName: "after-decline" });
    await vi.advanceTimersByTimeAsync(5000);

    expect(storage.has(SESSION_ID_KEY)).toBe(false);
    expect(requests).toEqual([]);
  });

  test("no meta tag: tracks as before and ignores consent updates", async () => {
    loadPage(null);
    await client.appLogs.logUserInApp("home");
    await vi.advanceTimersByTimeAsync(0);

    expect(consentListener).toBeNull();
    expect(analyticsRequests()).toHaveLength(1);
    expect(requests).toContain("/app-logs/app-1/log-user-in-app/home");
    expect(storage.has(SESSION_ID_KEY)).toBe(true);
  });
});
