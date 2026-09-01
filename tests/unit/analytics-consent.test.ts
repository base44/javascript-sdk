import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AxiosInstance } from "axios";
import type { InternalAuthModule } from "../../src/modules/auth.types.ts";

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

function makeAxiosClient() {
  return {
    defaults: { headers: { common: {} as Record<string, string> } },
    request: vi.fn().mockResolvedValue({ status: 200, data: {} }),
  } as unknown as AxiosInstance & { request: ReturnType<typeof vi.fn> };
}

function makeAuthModule() {
  return {
    hasToken: () => false,
    me: vi.fn(),
  } as unknown as InternalAuthModule;
}

// The consent status and the visitor id live in module-level shared state, so
// each test loads a fresh module registry against a fresh window stub.
async function loadAnalytics() {
  vi.resetModules();
  return await import("../../src/modules/analytics.ts");
}

type SharedAnalyticsState = {
  requestsQueue: unknown[];
  isProcessing: boolean;
  isHeartBeatProcessing: boolean;
  consent: string | null;
};

function getSharedAnalyticsState(): SharedAnalyticsState {
  return (globalThis as any).window.base44SharedInstances.analytics.instance;
}

describe("analytics consent", () => {
  beforeEach(() => {
    const localStorage = makeLocalStorage();
    vi.stubGlobal("window", {
      location: {
        href: "https://my-app.base44.app/",
        origin: "https://my-app.base44.app",
        pathname: "/",
        search: "",
      },
      localStorage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("document", {
      referrer: "https://referrer.example/",
      visibilityState: "visible",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  test("defaults preserve the legacy behavior: analytics starts immediately", async () => {
    const { createAnalyticsModule } = await loadAnalytics();
    const axiosClient = makeAxiosClient();

    const analytics = createAnalyticsModule({
      axiosClient,
      serverUrl: "https://api.base44.com",
      appId: "app-1",
      userAuthModule: makeAuthModule(),
    });

    expect(analytics.getConsentStatus()).toBe("granted");
    // The automatic initialization event flushes without any opt-in call.
    await vi.waitFor(() => expect(axiosClient.request).toHaveBeenCalled());
    // And the visitor id is persisted, exactly as before.
    expect(localStorage.getItem(ANALYTICS_SESSION_ID_KEY)).toBeTruthy();

    analytics.cleanup();
  });

  test("consent 'pending' keeps the module fully dormant", async () => {
    const { createAnalyticsModule } = await loadAnalytics();
    const axiosClient = makeAxiosClient();

    const analytics = createAnalyticsModule({
      axiosClient,
      serverUrl: "https://api.base44.com",
      appId: "app-1",
      userAuthModule: makeAuthModule(),
      options: { consent: "pending" },
    });

    expect(analytics.getConsentStatus()).toBe("pending");

    analytics.track({ eventName: "pre-consent-event" });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const sharedState = getSharedAnalyticsState();
    // The event is buffered in memory, and nothing else moves: no network, no
    // processor, no heartbeat, no visibility listener, no persisted id.
    expect(sharedState.requestsQueue.length).toBe(1);
    expect(axiosClient.request).not.toHaveBeenCalled();
    expect(sharedState.isProcessing).toBe(false);
    expect(sharedState.isHeartBeatProcessing).toBeFalsy();
    expect((globalThis as any).window.addEventListener).not.toHaveBeenCalled();
    expect(localStorage.getItem(ANALYTICS_SESSION_ID_KEY)).toBeNull();

    analytics.cleanup();
  });

  test("optIn() activates tracking and delivers the buffered events", async () => {
    const { createAnalyticsModule, getAnalyticsSessionId } =
      await loadAnalytics();
    const axiosClient = makeAxiosClient();

    const analytics = createAnalyticsModule({
      axiosClient,
      serverUrl: "https://api.base44.com",
      appId: "app-1",
      userAuthModule: makeAuthModule(),
      options: { consent: "pending" },
    });

    analytics.track({ eventName: "pre-consent-event" });
    // Pre-consent callers (e.g. the anonymous-id header) get an ephemeral id.
    const ephemeralId = getAnalyticsSessionId();
    expect(localStorage.getItem(ANALYTICS_SESSION_ID_KEY)).toBeNull();

    analytics.optIn();

    expect(analytics.getConsentStatus()).toBe("granted");
    // The ephemeral id is adopted as the persistent one, so the visitor keeps
    // a single identity across the consent grant.
    expect(localStorage.getItem(ANALYTICS_SESSION_ID_KEY)).toBe(ephemeralId);

    // The buffered event and the deferred initialization event both flush.
    // (The initialization event is queued after the processor grabs the first
    // batch, so it goes out one throttle cycle later.)
    const sentEvents = await vi.waitFor(
      () => {
        const events = axiosClient.request.mock.calls.flatMap(
          ([config]: any[]) => config.data.events
        );
        const names = events.map((e: any) => e.event_name);
        expect(names).toContain("pre-consent-event");
        expect(names).toContain("__initialization_event__");
        return events;
      },
      { timeout: 4000 }
    );
    for (const event of sentEvents) {
      expect(event.session_id).toBe(ephemeralId);
    }

    analytics.cleanup();
  });

  test("consent 'denied' drops tracked events", async () => {
    const { createAnalyticsModule } = await loadAnalytics();
    const axiosClient = makeAxiosClient();

    const analytics = createAnalyticsModule({
      axiosClient,
      serverUrl: "https://api.base44.com",
      appId: "app-1",
      userAuthModule: makeAuthModule(),
      options: { consent: "denied" },
    });

    analytics.track({ eventName: "denied-event" });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(getSharedAnalyticsState().requestsQueue.length).toBe(0);
    expect(axiosClient.request).not.toHaveBeenCalled();
    expect(localStorage.getItem(ANALYTICS_SESSION_ID_KEY)).toBeNull();

    analytics.cleanup();
  });

  test("optOut() stops tracking and removes the persisted visitor id", async () => {
    const { createAnalyticsModule } = await loadAnalytics();
    const axiosClient = makeAxiosClient();

    const analytics = createAnalyticsModule({
      axiosClient,
      serverUrl: "https://api.base44.com",
      appId: "app-1",
      userAuthModule: makeAuthModule(),
    });

    await vi.waitFor(() =>
      expect(localStorage.getItem(ANALYTICS_SESSION_ID_KEY)).toBeTruthy()
    );

    analytics.optOut();

    expect(analytics.getConsentStatus()).toBe("denied");
    // Withdrawing consent undoes the storage write.
    expect(localStorage.getItem(ANALYTICS_SESSION_ID_KEY)).toBeNull();

    axiosClient.request.mockClear();
    analytics.track({ eventName: "post-opt-out-event" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getSharedAnalyticsState().requestsQueue.length).toBe(0);
    expect(axiosClient.request).not.toHaveBeenCalled();

    analytics.cleanup();
  });

  test("the most restrictive explicitly-configured consent wins across clients", async () => {
    const { createAnalyticsModule } = await loadAnalytics();

    const first = createAnalyticsModule({
      axiosClient: makeAxiosClient(),
      serverUrl: "https://api.base44.com",
      appId: "app-1",
      userAuthModule: makeAuthModule(),
      options: { consent: "pending" },
    });

    // A later client that doesn't configure consent must not silently
    // re-enable tracking that another client deferred...
    const second = createAnalyticsModule({
      axiosClient: makeAxiosClient(),
      serverUrl: "https://api.base44.com",
      appId: "app-1",
      userAuthModule: makeAuthModule(),
    });
    expect(second.getConsentStatus()).toBe("pending");

    // ...and neither may an explicit but more permissive configuration.
    const third = createAnalyticsModule({
      axiosClient: makeAxiosClient(),
      serverUrl: "https://api.base44.com",
      appId: "app-1",
      userAuthModule: makeAuthModule(),
      options: { consent: "granted" },
    });
    expect(third.getConsentStatus()).toBe("pending");

    first.cleanup();
    second.cleanup();
    third.cleanup();
  });

  test("enabled: false turns the module off but consent still gates the persistent id", async () => {
    const { createAnalyticsModule } = await loadAnalytics();
    const axiosClient = makeAxiosClient();

    const analytics = createAnalyticsModule({
      axiosClient,
      serverUrl: "https://api.base44.com",
      appId: "app-1",
      userAuthModule: makeAuthModule(),
      options: { enabled: false, consent: "pending" },
    });

    analytics.track({ eventName: "ignored-event" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(axiosClient.request).not.toHaveBeenCalled();
    expect(getSharedAnalyticsState().requestsQueue.length).toBe(0);
    expect(analytics.getConsentStatus()).toBe("pending");

    analytics.cleanup();
  });

  test("pre-consent requests carry an ephemeral anonymous id, not a persisted one", async () => {
    vi.resetModules();
    const { createAnalyticsModule, getAnalyticsSessionId } = await import(
      "../../src/modules/analytics.ts"
    );
    const { createAxiosClient } = await import(
      "../../src/utils/axios-client.ts"
    );

    const analytics = createAnalyticsModule({
      axiosClient: makeAxiosClient(),
      serverUrl: "https://api.base44.com",
      appId: "app-1",
      userAuthModule: makeAuthModule(),
      options: { consent: "pending" },
    });

    const client = createAxiosClient({ baseURL: "https://api" });
    let captured: any;
    client.defaults.adapter = async (config) => {
      captured = config;
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    };
    await client.get("/conversations");

    // The header is still sent (anonymous agent access keeps working within
    // the page load), but nothing is written to localStorage until consent.
    const headerId = captured.headers.get("X-Base44-Anonymous-Id");
    expect(headerId).toBeTruthy();
    expect(localStorage.getItem(ANALYTICS_SESSION_ID_KEY)).toBeNull();
    // Stable within the page load.
    expect(getAnalyticsSessionId()).toBe(headerId);

    // Once granted, the same id becomes the persistent one.
    analytics.optIn();
    expect(localStorage.getItem(ANALYTICS_SESSION_ID_KEY)).toBe(headerId);

    analytics.cleanup();
  });

  test("createClient plumbs the analytics config through", async () => {
    vi.resetModules();
    const { createClient } = await import("../../src/client.ts");

    const base44 = createClient({
      serverUrl: "https://api.base44.com",
      appId: "app-1",
      analytics: { consent: "pending" },
    });

    expect(base44.analytics.getConsentStatus()).toBe("pending");
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Client construction itself must not persist a visitor id pre-consent.
    expect(localStorage.getItem(ANALYTICS_SESSION_ID_KEY)).toBeNull();

    base44.cleanup();
  });
});
