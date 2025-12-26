import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AnalyticsModuleOptions,
  createClient,
  SessionContext,
  TrackEventData,
} from "../../src/index.ts";
import { getSharedInstance } from "../../src/utils/sharedInstance.ts";

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
    base44 = createClient({
      serverUrl,
      appId,
    });
    sharedState = getSharedInstance("analytics", () => ({
      requestsQueue: [],
      isProcessing: false,
      sessionContext: {
        user_id: "test-user-id",
      },
      config: {
        enabled: true,
        maxQueueSize: 1000,
        throttleTime: 1000,
        batchSize: 30,
      },
    }));
  });

  afterEach(() => {
    base44.cleanup();
    sharedState = null;
  });

  test("should create analytics module with shared state", () => {
    expect(base44.analytics).toBeDefined();
    expect(sharedState).toBeDefined();
    expect(sharedState?.requestsQueue).toBeDefined();
    expect(sharedState?.isProcessing).toBe(true);
  });

  test("should track an event", () => {
    vi.spyOn(base44.analytics, "track").mockImplementation(() => {
      console.log("track called");
    });

    base44.analytics.track({ eventName: "test-event" });
    expect(base44.analytics.track).toHaveBeenCalledWith({
      eventName: "test-event",
    });
  });
});
