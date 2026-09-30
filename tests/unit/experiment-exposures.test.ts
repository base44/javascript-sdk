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

  test("queues exposure until flush with the runtime visitor and no client user claim", async () => {
    const tracker = createExposureTracker({ axiosClient: client, appId, enabled: true });
    tracker.track(assignment, identity);
    expect(request).not.toHaveBeenCalled();
    await tracker.flush();

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: `/apps/${appId}/analytics/track/batch`,
      headers: { Authorization: "Bearer user-1-token" },
      timeout: expect.any(Number),
      signal: expect.any(AbortSignal),
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

  test("deduplicates reads and batches distinct assignments only within the same identity", async () => {
    const tracker = createExposureTracker({ axiosClient: client, appId, enabled: true });
    tracker.track(assignment, identity);
    tracker.track({ ...assignment }, { ...identity });
    tracker.track({ ...assignment, run_version: 2 }, identity);
    tracker.track({ ...assignment, variant_key: "treatment" }, identity);
    tracker.track(assignment, { ...identity, userId: "user-2" });
    tracker.track(assignment, { ...identity, visitorId: "visitor-2" });
    await tracker.flush();
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.map(([config]) => config.data.events.length)).toEqual([3, 1, 1]);
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
    const delivery = tracker.flush();
    client.defaults.headers.common.Authorization = "Bearer replacement";
    await vi.advanceTimersByTimeAsync(100);
    await delivery;
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toMatchObject({
      data: request.mock.calls[0][0].data, headers: request.mock.calls[0][0].headers,
    });
    expect(request.mock.calls[0][0].data.events[0].event_id).toMatch(/^[0-9a-f-]{36}$/);
    vi.useRealTimers();
  });

  test("captures credential and visitor partitions before a mixed batch is flushed", async () => {
    const tracker = createExposureTracker({ axiosClient: client, appId, enabled: true });
    tracker.track(assignment, identity);
    client.defaults.headers.common.Authorization = "Bearer token-2";
    tracker.track({ ...assignment, experiment_id: "experiment-2" }, identity);
    tracker.track(assignment, { ...identity, visitorId: "visitor-2" });
    tracker.track(assignment, { visitorId: "visitor-2", userId: null });
    await tracker.flush();
    expect(request.mock.calls.map(([config]) => ({
      authorization: config.headers.Authorization, visitor: config.data.events[0].session_id,
      count: config.data.events.length,
    }))).toEqual([
      { authorization: "Bearer user-1-token", visitor: "runtime-visitor", count: 1 },
      { authorization: "Bearer token-2", visitor: "runtime-visitor", count: 1 },
      { authorization: "Bearer token-2", visitor: "visitor-2", count: 1 },
      { authorization: null, visitor: "visitor-2", count: 1 },
    ]);
  });

  test.each([0, 1])("backend flush settles accepted %s without resending on later reads", async (accepted) => {
    vi.stubGlobal("window", undefined);
    request.mockResolvedValue({ accepted });
    const tracker = createExposureTracker({ axiosClient: client, appId, enabled: true, source: "backend", pageUrl: "/checkout" });
    tracker.track(assignment, identity);
    await expect(tracker.flush()).resolves.toBeUndefined();
    tracker.track(assignment, identity);
    await tracker.flush();
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0].data.events[0]).toMatchObject({ properties: { source: "backend" }, page_url: "/checkout" });
  });

  test.each([400, 401, 403, 429])("terminal HTTP %s does not reject or resend", async (status) => {
    request.mockRejectedValue({ status });
    const tracker = createExposureTracker({ axiosClient: client, appId, enabled: true });
    tracker.track(assignment, identity);
    await expect(tracker.flush()).resolves.toBeUndefined();
    tracker.track(assignment, identity);
    await tracker.flush();
    expect(request).toHaveBeenCalledOnce();
  });

  test.each([new Error("offline"), { response: { status: 503 } }])("exhausted transient delivery settles without changing the event or credentials", async (error) => {
    vi.useFakeTimers();
    request.mockRejectedValue(error);
    const tracker = createExposureTracker({ axiosClient: client, appId, enabled: true, source: "backend" });
    tracker.track(assignment, identity);
    const settled = expect(tracker.flush()).resolves.toBeUndefined();
    client.defaults.headers.common.Authorization = "Bearer replacement";
    await vi.advanceTimersByTimeAsync(600);
    await settled;
    expect(request).toHaveBeenCalledTimes(3);
    const initial = request.mock.calls[0][0];
    expect(request.mock.calls[1][0]).toMatchObject({ data: initial.data, headers: initial.headers });
    expect(request.mock.calls[2][0]).toMatchObject({ data: initial.data, headers: initial.headers });
    tracker.track(assignment, identity);
    await tracker.flush();
    expect(request).toHaveBeenCalledTimes(3);
  });

  test("a stalled transport is cancelled at the total budget without failing the Worker", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", undefined);
    request.mockReturnValue(new Promise(() => {}));
    const tracker = createExposureTracker({ axiosClient: client, appId, enabled: true, source: "backend" });
    tracker.track(assignment, identity);
    const settled = vi.fn();
    const delivery = tracker.flush().then(settled);
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).not.toHaveBeenCalled();
    const signal = request.mock.calls[0][0].signal;
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await delivery;
    expect(settled).toHaveBeenCalledOnce();
    expect(signal.aborted).toBe(true);
    tracker.track(assignment, identity);
    await tracker.flush();
    expect(request).toHaveBeenCalledOnce();
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

    await tracker.flush();
    expect(adapter).toHaveBeenCalledOnce();
    expect(adapter.mock.calls[0][0].headers.get("Authorization")).toBe(
      userId ? "Bearer user-1-token" : null,
    );
  });

  test("uses explicit null auth when no default header exists", async () => {
    delete client.defaults.headers.common.Authorization;
    const tracker = createExposureTracker({ axiosClient: client, appId, enabled: true });
    tracker.track(assignment, identity);
    await tracker.flush();
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
