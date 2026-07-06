import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AnalyticsModuleOptions,
  createClient,
  SessionContext,
  TrackEventData,
} from "../../src/index.ts";
import { getSharedInstance } from "../../src/utils/sharedInstance.ts";
import { User } from "../../src/modules/auth.types.ts";
import { AxiosInstance } from "axios";

describe("Analytics Module", () => {
  let base44: ReturnType<typeof createClient>;
  let sharedState: null | {
    requestsQueue: TrackEventData[];
    isProcessing: boolean;
    isHeartBeatProcessing: boolean;
    wasInitializationTracked: boolean;
    sessionContext: SessionContext;
    config: AnalyticsModuleOptions;
  };
  const appId = "test-app-id";
  const serverUrl = "https://api.base44.com";

  const stubBrowserGlobals = () => {
    // Analytics is browser-only, so simulate the browser globals it relies on
    vi.stubGlobal("window", {
      location: {
        search: "",
        pathname: "/",
        href: "https://app.example.com/",
        protocol: "https:",
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      history: { replaceState: vi.fn() },
    });
    vi.stubGlobal("document", {
      referrer: "",
      title: "",
      visibilityState: "visible",
      cookie: "",
    });
  };

  beforeEach(() => {
    vi.mock("../../src/utils/axios-client.ts", () => ({
      createAxiosClient: vi.fn().mockImplementation(
        () =>
          ({
            request: vi.fn().mockResolvedValue({
              status: 200,
              data: {
                message: "success",
              },
            }),
          } as unknown as AxiosInstance)
      ),
    }));
    stubBrowserGlobals();
    sharedState = getSharedInstance("analytics", () => ({
      requestsQueue: [],
      isProcessing: false,
      isHeartBeatProcessing: false,
      wasInitializationTracked: false,
      sessionContext: {},
      config: {},
    }));
    sharedState.isProcessing = false;
    sharedState.isHeartBeatProcessing = false;
    // suppress the one-time initialization event so tests stay deterministic
    sharedState.wasInitializationTracked = true;
    sharedState.requestsQueue = [];
    sharedState.sessionContext = {
      user_id: "test-user-id",
    };
    sharedState.config = {
      enabled: true,
      maxQueueSize: 1000,
      throttleTime: 1000,
      batchSize: 2,
      heartBeatInterval: undefined,
    };

    base44 = createClient({
      serverUrl,
      appId,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    base44.cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    sharedState = null;
  });

  test("should create analytics module with shared state", () => {
    expect(base44.analytics).toBeDefined();
    expect(sharedState).toBeDefined();
    expect(sharedState?.requestsQueue).toBeDefined();
    expect(sharedState?.isProcessing).toBe(false);
  });

  test("should track an event", () => {
    vi.spyOn(base44.analytics, "track");

    base44.analytics.track({ eventName: "test-event" });
    expect(sharedState?.isProcessing).toBe(true);
    expect(base44.analytics.track).toHaveBeenCalledWith({
      eventName: "test-event",
    });
  });

  test("should track multiple events", async () => {
    vi.useFakeTimers();

    for (let i = 0; i < 5; i++) {
      base44.analytics.track({ eventName: `test-event ${i}` });
    }

    expect(sharedState?.isProcessing).toBe(true);
    expect(sharedState?.requestsQueue.length).toBe(4);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sharedState?.requestsQueue.length).toBe(2);
    // add another event while processing to mix things up
    base44.analytics.track({ eventName: `test-event 5` });

    await vi.advanceTimersByTimeAsync(1000);
    expect(sharedState?.requestsQueue.length).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sharedState?.requestsQueue.length).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sharedState?.isProcessing).toBe(false);
  });

  test("should start the heartbeat interval in a browser when configured", () => {
    sharedState!.config.heartBeatInterval = 60 * 1000;
    vi.useFakeTimers();

    const client = createClient({ serverUrl, appId });
    expect(vi.getTimerCount()).toBe(1);
    expect(sharedState?.isHeartBeatProcessing).toBe(true);

    client.cleanup();
    expect(vi.getTimerCount()).toBe(0);
    expect(sharedState?.isHeartBeatProcessing).toBe(false);
  });

  test("should become a no-op when disableAnalytics is set", () => {
    sharedState!.config.heartBeatInterval = 60 * 1000;
    vi.useFakeTimers();

    const client = createClient({ serverUrl, appId, disableAnalytics: true });

    expect(vi.getTimerCount()).toBe(0);
    client.analytics.track({ eventName: "ignored-event" });
    expect(sharedState?.requestsQueue.length).toBe(0);
    expect(sharedState?.isProcessing).toBe(false);

    client.cleanup();
  });
});

describe("Analytics Module without a browser environment", () => {
  const appId = "test-app-id";
  const serverUrl = "https://api.base44.com";

  test("should be a no-op and start no timers (worker/SSR safety)", () => {
    // node test environment: no window global, like Cloudflare Workers SSR
    expect(typeof window).toBe("undefined");
    vi.useFakeTimers();

    const client = createClient({ serverUrl, appId });
    const sharedState = getSharedInstance("analytics", () => ({
      requestsQueue: [] as TrackEventData[],
      isProcessing: false,
    }));
    sharedState.requestsQueue.splice(0);

    expect(vi.getTimerCount()).toBe(0);
    expect(() => client.analytics.track({ eventName: "test-event" })).not.toThrow();
    expect(sharedState.requestsQueue.length).toBe(0);
    expect(sharedState.isProcessing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    client.cleanup();
    vi.useRealTimers();
  });
});
