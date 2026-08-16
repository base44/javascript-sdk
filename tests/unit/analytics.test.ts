import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AnalyticsModuleOptions,
  createClient,
  SessionContext,
  TrackEventData,
} from "../../src/index.ts";
import { getSharedInstance } from "../../src/utils/sharedInstance.ts";
import { resetAnalyticsSessionContext } from "../../src/modules/analytics.ts";
import { User } from "../../src/modules/auth.types.ts";
import { AxiosInstance } from "axios";

describe("Analytics Module", () => {
  let base44: ReturnType<typeof createClient>;
  let sharedState: null | {
    requestsQueue: TrackEventData[];
    isProcessing: boolean;
    sessionContext: SessionContext;
    config: AnalyticsModuleOptions;
  };
  const appId = "test-app-id";
  const serverUrl = "https://api.base44.com";

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
    sharedState = getSharedInstance("analytics", () => ({
      requestsQueue: [],
      isProcessing: false,
      sessionContext: {},
      config: {},
    }));
    sharedState.isProcessing = false;
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

  test("should clear the memoized session context on reset", () => {
    expect(sharedState?.sessionContext).toEqual({ user_id: "test-user-id" });

    resetAnalyticsSessionContext();

    // Called on every identity change. Without it, a visitor who loads
    // anonymously and then logs in keeps reporting the pre-login identity.
    expect(sharedState?.sessionContext).toBeNull();
  });

  test("should not restore the pre-reset identity when a lookup settles late", async () => {
    resetAnalyticsSessionContext();

    let resolveMe: (user: User) => void;
    vi.spyOn(base44.auth, "me").mockReturnValue(
      new Promise<User>((resolve) => {
        resolveMe = resolve;
      })
    );

    // Flushing this event resolves the session context, which suspends on me().
    base44.analytics.track({ eventName: "anonymous-event" });
    await vi.waitFor(() => expect(base44.auth.me).toHaveBeenCalled());

    // The identity changes while that lookup is still in flight.
    resetAnalyticsSessionContext();
    resolveMe!({ id: "anonymous-user" } as User);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The anonymous identity must not be written back: doing so pins user_id
    // for the rest of the session, which is the bug the reset exists to prevent.
    expect(sharedState?.sessionContext).toBeNull();
  });

  test("should not start the heartbeat outside a browser", () => {
    const heartBeatState = sharedState as unknown as {
      isHeartBeatProcessing: boolean;
    };

    expect(typeof window).toBe("undefined");
    expect(heartBeatState.isHeartBeatProcessing).toBeFalsy();
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
});
