import axios, { type AxiosInstance } from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createExposureTracker } from "../../src/modules/experiment-exposures.js";
import { createAnalyticsModule, getAnalyticsSessionId, resetAnalyticsSessionContext } from "../../src/modules/analytics.js";
import { createAuthModule } from "../../src/modules/auth.js";

const assignment = { experiment_id: "experiment-1", run_version: 1, variant_key: "control" };
const identity = { visitorId: "runtime-visitor", userId: "user-1" };
const appId = "66f1a2b3c4d5e6f7a8b9c0d1";

describe("experiment exposure transport", () => {
  let client: AxiosInstance;
  let request: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { pathname: "/checkout", search: "" },
      history: { replaceState: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {});
    client = axios.create();
    client.defaults.headers.common.Authorization = "Bearer user-1-token";
    request = vi.spyOn(client, "request").mockResolvedValue({ accepted: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  test("sends one immediate batch with the runtime visitor and no client user claim", () => {
    const tracker = createExposureTracker({ axiosClient: client, appId, enabled: true });
    tracker.track(assignment, identity);

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: `/apps/${appId}/analytics/track/batch`,
      headers: { Authorization: "Bearer user-1-token" },
      data: { events: [{
        event_name: "__experiment_exposure__",
        event_id: expect.any(String),
        timestamp: expect.any(String),
        session_id: "runtime-visitor",
        page_url: "/checkout",
        properties: { ...assignment, source: "browser" },
      }] },
    });
    const event = request.mock.calls[0][0].data.events[0];
    expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
  });

  test("deduplicates reads but allows new runs, variants, users and visitors", () => {
    const tracker = createExposureTracker({ axiosClient: client, appId, enabled: true });
    tracker.track(assignment, identity);
    tracker.track({ ...assignment }, { ...identity });
    tracker.track({ ...assignment, run_version: 2 }, identity);
    tracker.track({ ...assignment, variant_key: "treatment" }, identity);
    tracker.track(assignment, { ...identity, userId: "user-2" });
    tracker.track(assignment, { ...identity, visitorId: "visitor-2" });

    expect(request).toHaveBeenCalledTimes(5);
  });

  test.each(["getItem", "setItem"])("attributes goals to the exposure when storage %s fails", async (method) => {
    vi.useFakeTimers();
    const storage = { getItem: vi.fn(() => null as string | null), setItem: vi.fn() };
    storage[method as keyof typeof storage].mockImplementation(() => { throw new Error("storage blocked"); });
    vi.stubGlobal("localStorage", storage);
    Object.assign(window, { __B44_EXPERIMENTS__: identity });
    delete client.defaults.headers.common.Authorization;
    resetAnalyticsSessionContext();
    const userAuthModule = createAuthModule(client, axios.create(), appId, { serverUrl: "https://example.test", appBaseUrl: "https://example.test" });
    const analytics = createAnalyticsModule({ axiosClient: client, appId, serverUrl: "https://example.test", userAuthModule, enabled: true });
    try {
      createExposureTracker({ axiosClient: client, appId, enabled: true }).track(assignment, { ...identity, userId: null });
      analytics.track({ eventName: "purchase" });
      await vi.advanceTimersByTimeAsync(1000);
      storage.getItem.mockReturnValue("recovered-storage-visitor");
      storage.setItem.mockImplementation(() => {});
      analytics.track({ eventName: "purchase_after_storage_recovers" });
      await vi.advanceTimersByTimeAsync(1000);

      const events = request.mock.calls.flatMap(([config]) => config.data.events);
      for (const eventName of ["__experiment_exposure__", "purchase", "purchase_after_storage_recovers"]) {
        expect(events.find((event) => event.event_name === eventName)?.session_id).toBe(identity.visitorId);
      }
    } finally {
      analytics.cleanup();
      vi.useRealTimers();
    }
  });

  test.each([undefined, "anon"])("keeps ordinary visitor IDs when runtime ID is %s", (visitorId) => {
    Object.assign(window, { __B44_EXPERIMENTS__: visitorId ? { visitorId } : undefined });
    const storage = { getItem: vi.fn(() => "stored-visitor"), setItem: vi.fn() };
    vi.stubGlobal("localStorage", storage);
    expect(getAnalyticsSessionId()).toBe("stored-visitor");

    storage.getItem.mockImplementation(() => { throw new Error("storage blocked"); });
    const fallback = getAnalyticsSessionId();
    expect(fallback).toBeTruthy();
    expect(fallback).not.toBe("anon");
    expect(getAnalyticsSessionId()).toBe(fallback);
  });

  test("automatically retries the same event and credentials after a lost acknowledgement", async () => {
    vi.useFakeTimers();
    request.mockRejectedValueOnce(new Error("offline"));
    const tracker = createExposureTracker({ axiosClient: client, appId, enabled: true });
    tracker.track(assignment, identity);
    client.defaults.headers.common.Authorization = "Bearer replacement";
    await vi.advanceTimersByTimeAsync(100);
    await tracker.flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toEqual(request.mock.calls[0][0]);
    expect(request.mock.calls[0][0].data.events[0].event_id).toMatch(/^[0-9a-f-]{36}$/);
    vi.useRealTimers();
  });

  test("backend flush rejects unaccepted batches and a later flush reuses the same event", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", undefined);
    request.mockResolvedValue({ accepted: 0 });
    const tracker = createExposureTracker({ axiosClient: client, appId, enabled: true, source: "backend", pageUrl: "/checkout" });
    tracker.track(assignment, identity);
    const failed = expect(tracker.flush()).rejects.toThrow("not accepted");
    await vi.advanceTimersByTimeAsync(600);
    await failed;
    expect(request).toHaveBeenCalledTimes(3);
    const initial = request.mock.calls[0][0];
    expect(initial.data.events[0].properties.source).toBe("backend");
    expect(initial.data.events[0].page_url).toBe("/checkout");
    request.mockResolvedValue({ accepted: 1 });
    await tracker.flush();
    expect(request).toHaveBeenCalledTimes(4);
    expect(request.mock.calls[3][0]).toEqual(initial);
    tracker.track(assignment, identity);
    await tracker.flush();
    expect(request).toHaveBeenCalledTimes(4);
  });

  test.each(["user-1", null])("pins Authorization before defaults change for %s", async (userId) => {
    request.mockRestore();
    const adapter = vi.fn(async (config) => ({ data: { accepted: 1 }, status: 200, statusText: "OK", headers: {}, config }));
    client.defaults.adapter = adapter;
    client.interceptors.response.use((response) => response.data);
    client.interceptors.request.use(async (config) => {
      await Promise.resolve();
      return config;
    });
    const tracker = createExposureTracker({ axiosClient: client, appId, enabled: true });
    tracker.track(assignment, { ...identity, userId });
    client.defaults.headers.common.Authorization = "Bearer replacement-token";

    await vi.waitFor(() => expect(adapter).toHaveBeenCalledOnce());
    expect(adapter.mock.calls[0][0].headers.get("Authorization")).toBe(
      userId ? "Bearer user-1-token" : null,
    );
  });

  test("uses explicit null auth when no default header exists", () => {
    delete client.defaults.headers.common.Authorization;
    createExposureTracker({ axiosClient: client, appId, enabled: true }).track(assignment, identity);

    expect(request.mock.calls[0][0].headers.Authorization).toBeNull();
  });

  test("does not send when disabled in client options or outside a browser", () => {
    createExposureTracker({ axiosClient: client, appId, enabled: false }).track(assignment, identity);
    vi.stubGlobal("window", undefined);
    createExposureTracker({ axiosClient: client, appId, enabled: true }).track(assignment, identity);

    expect(request).not.toHaveBeenCalled();
  });

  test("honors the URL opt-out after analytics consumes and removes the parameter", async () => {
    window.location.search = "?analytics-enable=false";
    vi.resetModules();
    const { createExposureTracker: createTracker } = await import("../../src/modules/experiment-exposures.js");
    expect(window.history.replaceState).toHaveBeenCalledOnce();
    expect(window.history.replaceState).toHaveBeenCalledWith({}, "", "/checkout");
    window.location.search = "";
    createTracker({ axiosClient: client, appId, enabled: true }).track(assignment, identity);

    expect(request).not.toHaveBeenCalled();
  });

  test("does not send on React Native", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", undefined);
    vi.resetModules();
    const { createExposureTracker: createTracker } = await import("../../src/modules/experiment-exposures.js");
    createTracker({ axiosClient: client, appId, enabled: true }).track(assignment, identity);

    expect(request).not.toHaveBeenCalled();
  });
});
