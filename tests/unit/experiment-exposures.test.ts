import axios, { type AxiosInstance } from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createExposureTracker } from "../../src/modules/experiment-exposures.js";

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
    });
    vi.stubGlobal("document", {});
    client = axios.create();
    client.defaults.headers.common.Authorization = "Bearer user-1-token";
    request = vi.spyOn(client, "request").mockResolvedValue({ data: { accepted: 1 } });
  });

  afterEach(() => {
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
        timestamp: expect.any(String),
        session_id: "runtime-visitor",
        page_url: "/checkout",
        properties: assignment,
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

  test("retries on a later read after a failed request without an unhandled rejection", async () => {
    request.mockRejectedValueOnce(new Error("offline"));
    const tracker = createExposureTracker({ axiosClient: client, appId, enabled: true });
    tracker.track(assignment, identity);
    await Promise.resolve();
    tracker.track(assignment, identity);

    expect(request).toHaveBeenCalledTimes(2);
  });

  test.each(["user-1", null])("pins Authorization before defaults change for %s", async (userId) => {
    request.mockRestore();
    const adapter = vi.fn(async (config) => ({ data: {}, status: 200, statusText: "OK", headers: {}, config }));
    client.defaults.adapter = adapter;
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
