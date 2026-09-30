import axios from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createClient } from "../../src/client.js";
import { getSharedInstance } from "../../src/utils/sharedInstance.js";
import type { AnalyticsModuleOptions } from "../../src/modules/analytics.types.js";

vi.mock("partysocket", () => ({ WebSocket: class {} }));

describe("Analytics Module", () => {
  let client: ReturnType<typeof createClient>;
  let adapter: ReturnType<typeof vi.fn>;
  let config: AnalyticsModuleOptions;
  const clients: ReturnType<typeof createClient>[] = [];
  const events = () => batches().flatMap((request) => JSON.parse(request.data).events);
  const batches = () => adapter.mock.calls.map(([request]) => request)
    .filter((request) => request.url.endsWith("/analytics/track/batch"));
  const makeClient = (options = {}) => {
    const result = createClient({ appId: "app", ...options });
    clients.push(result);
    return result;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    const stored = new Map<string, string>();
    const storage = { getItem: vi.fn((key) => stored.get(key) ?? null),
      setItem: vi.fn((key, value) => stored.set(key, value)), removeItem: vi.fn((key) => stored.delete(key)) };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("document", { referrer: "", visibilityState: "visible" });
    vi.stubGlobal("window", {
      location: { origin: "https://example.com", pathname: "/", search: "" },
      localStorage: storage, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    });
    const shared = getSharedInstance("analytics", () => ({ config: {} }));
    config = shared.config;
    Object.assign(config, { enabled: true, maxQueueSize: 1000, throttleTime: 1000, batchSize: 2, heartBeatInterval: 0 });
    Object.assign(shared, { wasInitializationTracked: true, isHeartBeatProcessing: false, sessionStartTime: null });
    const create = axios.create.bind(axios);
    adapter = vi.fn(async (request) => ({
      data: request.url.endsWith("/entities/User/me")
        ? { id: request.headers.get("Authorization").replace("Bearer token-", "user-") }
        : { accepted: 1 },
      status: 200, statusText: "OK", headers: {}, config: request,
    }));
    vi.spyOn(axios, "create").mockImplementation((options) => {
      const api = create(options);
      api.defaults.adapter = adapter;
      return api;
    });
    client = makeClient();
  });

  afterEach(() => {
    for (const client of clients.splice(0)) client.cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("captures the event's time and properties before the scheduled batch", async () => {
    const properties = { amount: 42 };
    const timestamp = new Date().toISOString();
    client.analytics.track({ eventName: "purchase", properties });
    properties.amount = 99;
    expect(batches()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(events()).toEqual([expect.objectContaining({
      event_name: "purchase", timestamp, properties: { amount: 42 },
    })]);
  });

  test("respects the configured batch size and interval", async () => {
    for (let index = 0; index < 5; index++) client.analytics.track({ eventName: `event_${index}` });
    await vi.advanceTimersByTimeAsync(999);
    expect(batches()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(events().map((event) => event.event_name)).toEqual(["event_0", "event_1"]);
    client.analytics.track({ eventName: "event_5" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(batches().map((request) => JSON.parse(request.data).events.length)).toEqual([2, 2, 2]);
    expect(events().map((event) => event.event_name)).toEqual(Array.from({ length: 6 }, (_, index) => `event_${index}`));
  });

  test("drops overflow without replacing the first queued events", async () => {
    config.maxQueueSize = 2;
    for (const eventName of ["first", "second", "overflow"]) client.analytics.track({ eventName });
    await client.experiments.flush();
    expect(events().map((event) => event.event_name)).toEqual(["first", "second"]);
  });

  test("ordinary Analytics failures remain best effort without new retries", async () => {
    adapter.mockRejectedValue(new Error("offline"));
    client.analytics.track({ eventName: "purchase" });
    await client.experiments.flush();
    await vi.advanceTimersByTimeAsync(10000);
    expect(batches()).toHaveLength(1);
  });

  test("disabled clients do not track or register automatic browser work", async () => {
    const addListener = vi.mocked(window.addEventListener);
    addListener.mockClear();
    const disabled = makeClient({ analytics: { enabled: false } });
    disabled.analytics.track({ eventName: "not_tracked" });
    await disabled.experiments.flush();
    expect(adapter).not.toHaveBeenCalled();
    expect(addListener).not.toHaveBeenCalled();
  });

  test("anonymous events skip identity lookup and retain null Authorization after login", async () => {
    client.analytics.track({ eventName: "anonymous" });
    client.setToken("token-a");
    client.analytics.track({ eventName: "authenticated" });
    await client.experiments.flush();
    const requests = batches();
    expect(requests).toHaveLength(2);
    expect(requests[0].headers.get("Authorization")).toBeNull();
    expect(requests[1].headers.get("Authorization")).toBe("Bearer token-a");
    expect(events()).toEqual([
      expect.objectContaining({ event_name: "anonymous", user_id: null }),
      expect.objectContaining({ event_name: "authenticated", user_id: "user-a" }),
    ]);
    expect(adapter.mock.calls.filter(([request]) => request.url.endsWith("/entities/User/me"))).toHaveLength(1);
  });

  test("different browser clients cannot share credentials, identities, or queued events", async () => {
    const a = makeClient({ appId: "app-a", token: "token-a" });
    const b = makeClient({ appId: "app-b", token: "token-b" });
    a.analytics.track({ eventName: "goal_a" });
    b.analytics.track({ eventName: "goal_b" });
    await a.experiments.flush();
    expect(batches()).toHaveLength(1);
    expect(batches()[0].url).toBe("/apps/app-a/analytics/track/batch");
    expect(events()[0]).toMatchObject({ event_name: "goal_a", user_id: "user-a" });
    a.cleanup();
    await b.experiments.flush();
    expect(batches()[1].url).toBe("/apps/app-b/analytics/track/batch");
    expect(batches()[1].headers.get("Authorization")).toBe("Bearer token-b");
    expect(events()[1]).toMatchObject({ event_name: "goal_b", user_id: "user-b" });
  });

  test("a late old identity lookup cannot replace the new token's cached goal identity", async () => {
    const user = makeClient({ token: "token-a" });
    let releaseOld: () => void;
    const normalAdapter = adapter.getMockImplementation()!;
    adapter.mockImplementation((request) => request.url.endsWith("/entities/User/me") &&
      request.headers.get("Authorization") === "Bearer token-a"
      ? new Promise((resolve) => { releaseOld = async () => resolve(await normalAdapter(request)); })
      : normalAdapter(request));
    user.analytics.track({ eventName: "old_user" });
    await vi.advanceTimersByTimeAsync(0);
    user.setToken("token-b");
    user.analytics.track({ eventName: "new_user" });
    await vi.advanceTimersByTimeAsync(0);
    releaseOld!();
    await user.experiments.flush();
    user.analytics.track({ eventName: "new_user_again" });
    await user.experiments.flush();
    expect(events()).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_name: "old_user", user_id: "user-a" }),
      expect.objectContaining({ event_name: "new_user", user_id: "user-b" }),
      expect.objectContaining({ event_name: "new_user_again", user_id: "user-b" }),
    ]));
    expect(adapter.mock.calls.filter(([request]) => request.url.endsWith("/entities/User/me"))).toHaveLength(2);
  });

  test("hidden documents immediately drain their pending events", async () => {
    client.analytics.track({ eventName: "purchase" });
    Object.assign(document, { visibilityState: "hidden" });
    const listener = vi.mocked(window.addEventListener).mock.calls.find(([name]) => name === "visibilitychange")![1] as () => void;
    listener();
    await vi.advanceTimersByTimeAsync(0);
    expect(events().map((event) => event.event_name)).toEqual(["purchase"]);
  });

  test("multiple browser clients retain a single initialization and heartbeat stream", async () => {
    const shared = getSharedInstance("analytics", () => ({ config: {} }));
    Object.assign(shared, { wasInitializationTracked: false });
    config.heartBeatInterval = 2000;
    const a = makeClient();
    const b = makeClient();
    await vi.advanceTimersByTimeAsync(3000);
    expect(events().filter((event) => event.event_name === "__initialization_event__")).toHaveLength(1);
    expect(events().filter((event) => event.event_name === "__user_heartbeat_event__")).toHaveLength(1);
    a.cleanup();
    b.cleanup();
  });

  test("a hanging identity lookup cannot keep a Worker flush pending beyond five seconds", async () => {
    vi.stubGlobal("window", undefined);
    const worker = makeClient({ token: "token-a" });
    adapter.mockReturnValue(new Promise(() => {}));
    worker.analytics.track({ eventName: "purchase" });
    const settled = vi.fn();
    const delivery = worker.experiments.flush().then(settled);
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await delivery;
    expect(settled).toHaveBeenCalledOnce();
    await worker.experiments.flush();
    expect(batches()).toHaveLength(0);
  });

  test("server clients never start automatic heartbeat timers", () => {
    vi.stubGlobal("window", undefined);
    const setInterval = vi.spyOn(globalThis, "setInterval");
    makeClient({ token: "token-a" });
    expect(setInterval).not.toHaveBeenCalled();
  });

  test("ready exposures are delivered while an unrelated goal's old identity lookup hangs", async () => {
    vi.stubGlobal("window", undefined);
    const context = { config: { v: 1 as const, app_id: "app", flags: [], experiments: [{
      id: "exp", flag_key: "checkout", run_version: 1, assign_by: "visitor" as const, traffic_allocation: 100,
      variants: [{ key: "control", value: false, weight: 0 }, { key: "treatment", value: true, weight: 100 }],
    }] }, identity: { visitorId: "visitor", userId: "user-a", status: "authenticated" as const } };
    const worker = makeClient({ token: "token-a", experiments: context });
    const normalAdapter = adapter.getMockImplementation()!;
    adapter.mockImplementation((request) => request.url.endsWith("/entities/User/me")
      ? new Promise(() => {}) : normalAdapter(request));
    worker.analytics.track({ eventName: "blocked_goal" });
    worker.auth.logout();
    expect(worker.experiments.isEnabled("checkout")).toBe(true);
    const delivery = worker.experiments.flush();
    await vi.advanceTimersByTimeAsync(1);
    expect(events()).toEqual([expect.objectContaining({ event_name: "__experiment_exposure__", session_id: "visitor" })]);
    expect(batches()[0].headers.get("Authorization")).toBeNull();
    await vi.advanceTimersByTimeAsync(4999);
    await delivery;
    expect(batches()).toHaveLength(1);
  });
});
