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
