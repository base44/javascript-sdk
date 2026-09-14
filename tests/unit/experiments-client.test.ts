import axios from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createClient, createClientFromRequest } from "../../src/client.js";
import { resetAnalyticsSessionContext } from "../../src/modules/analytics.js";
import type { ExperimentsContext } from "../../src/modules/experiments-config.types.js";
import { getSharedInstance } from "../../src/utils/sharedInstance.js";

vi.mock("partysocket", () => ({ WebSocket: class {} }));

const context: ExperimentsContext = {
  config: { v: 1, revision: 2, app_id: "app", flags: [], experiments: [{
    id: "exp", flag_key: "checkout", run_version: 1, assign_by: "user", traffic_allocation: 100,
    variants: [{ key: "control", value: false, weight: 0 }, { key: "treatment", value: true, weight: 100 }],
  }] },
  identity: { visitorId: "visitor", userId: "user", status: "authenticated" },
  preview: {},
};
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

beforeEach(() => {
  const state = getSharedInstance("analytics", () => ({ config: {} }));
  Object.assign(state, { requestsQueue: [], isProcessing: false, isHeartBeatProcessing: false,
    wasInitializationTracked: true, sessionContext: null, sessionStartTime: null });
  Object.assign(state.config, { enabled: true, maxQueueSize: 1000, throttleTime: 1000, batchSize: 30, heartBeatInterval: 0 });
  resetAnalyticsSessionContext();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function captureAnalytics() {
  const create = axios.create.bind(axios);
  const adapter = vi.fn(async (config) => ({ data: { accepted: 1 }, status: 200, statusText: "OK", headers: {}, config }));
  vi.spyOn(axios, "create").mockImplementation((config) => {
    const api = create(config);
    api.defaults.adapter = adapter;
    return api;
  });
  return adapter;
}

describe("client experiments integration", () => {
  test("three distinct feature reads and a goal share one request-scoped Analytics batch", async () => {
    const create = axios.create.bind(axios);
    const adapter = vi.fn(async (config) => ({
      data: config.url.endsWith("/entities/User/me") ? { id: "user" } : { accepted: 4 },
      status: 200, statusText: "OK", headers: {}, config,
    }));
    vi.spyOn(axios, "create").mockImplementation((options) => {
      const api = create(options);
      api.defaults.adapter = adapter;
      return api;
    });
    const requestContext = { ...context, config: { ...context.config,
      experiments: ["checkout", "pricing", "headline"].map((flag_key) => ({
        ...context.config.experiments[0], id: `experiment_${flag_key}`, flag_key,
      })),
    } };
    const client = createClientFromRequest(new Request("https://app.example/checkout", { headers: {
      "Base44-App-Id": "app", Authorization: "Bearer user-token",
      "Base44-Experiments-Context": encode(requestContext),
    } }));
    for (const flag of ["checkout", "pricing", "headline"]) expect(client.experiments.isEnabled(flag)).toBe(true);
    client.analytics.track({ eventName: "purchase", properties: { amount: 42 } });
    await client.experiments.flush();
    const batches = adapter.mock.calls.map(([request]) => request)
      .filter((request) => request.url.endsWith("/analytics/track/batch"));
    expect(batches).toHaveLength(1);
    expect(batches[0].headers.get("Authorization")).toBe("Bearer user-token");
    const events = JSON.parse(batches[0].data).events;
    expect(events.map((event) => event.event_name)).toEqual([
      "__experiment_exposure__", "__experiment_exposure__", "__experiment_exposure__", "purchase",
    ]);
    expect(new Set(events.slice(0, 3).map((event) => event.event_id)).size).toBe(3);
    expect(events.every((event) => event.session_id === "visitor")).toBe(true);
    client.cleanup();
  });

  test("a lost mixed-batch acknowledgement retries only exposures with their original time, ID and credential", async () => {
    vi.useFakeTimers();
    const create = axios.create.bind(axios);
    let batchAttempt = 0;
    const adapter = vi.fn(async (config) => {
      if (config.url.endsWith("/analytics/track/batch") && batchAttempt++ === 0) throw new Error("lost acknowledgement");
      return { data: config.url.endsWith("/entities/User/me") ? { id: "user" } : { accepted: 0 },
        status: 200, statusText: "OK", headers: {}, config };
    });
    vi.spyOn(axios, "create").mockImplementation((options) => {
      const api = create(options);
      api.defaults.adapter = adapter;
      return api;
    });
    const client = createClientFromRequest(new Request("https://app.example/checkout", { headers: {
      "Base44-App-Id": "app", Authorization: "Bearer original-token", "Base44-Experiments-Context": encode(context),
    } }));
    const exposureTime = new Date().toISOString();
    client.experiments.isEnabled("checkout");
    await vi.advanceTimersByTimeAsync(25);
    const goalTime = new Date().toISOString();
    client.analytics.track({ eventName: "purchase" });
    const delivery = client.experiments.flush();
    client.setToken("replacement-token");
    await vi.advanceTimersByTimeAsync(100);
    await delivery;
    const batches = adapter.mock.calls.map(([request]) => request)
      .filter((request) => request.url.endsWith("/analytics/track/batch"));
    expect(batches).toHaveLength(2);
    expect(batches.map((request) => request.headers.get("Authorization"))).toEqual(["Bearer original-token", "Bearer original-token"]);
    const first = JSON.parse(batches[0].data).events;
    expect(JSON.parse(batches[1].data).events).toEqual([first[0]]);
    expect(first.map((event) => event.timestamp)).toEqual([exposureTime, goalTime]);
    expect(first[0].event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first[1]).not.toHaveProperty("event_id");
    await client.experiments.flush();
    expect(adapter.mock.calls.filter(([request]) => request.url.endsWith("/analytics/track/batch"))).toHaveLength(2);
    client.cleanup();
  });

  test("request context evaluates synchronously and flushes with the request's user token", async () => {
    const create = axios.create.bind(axios);
    const adapter = vi.fn(async (config) => ({ data: { accepted: 1 }, status: 200, statusText: "OK", headers: {}, config }));
    vi.spyOn(axios, "create").mockImplementation((config) => {
      const api = create(config);
      api.defaults.adapter = adapter;
      return api;
    });
    const client = createClientFromRequest(new Request("https://app.example/checkout", { headers: {
      "Base44-App-Id": "app", "Authorization": "Bearer user-token", "Base44-Experiments-Context": encode(context),
    } }));
    expect(client.experiments.getSnapshot()).toEqual({ flags: { checkout: true }, isLoading: false });
    expect(adapter).not.toHaveBeenCalled();
    expect(client.experiments.isEnabled("checkout")).toBe(true);
    await client.experiments.flush();
    expect(adapter).toHaveBeenCalledOnce();
    const request = adapter.mock.calls[0][0];
    expect(request.url).toBe("/apps/app/analytics/track/batch");
    expect(request.headers.get("Authorization")).toBe("Bearer user-token");
    expect(request.headers.has("Base44-Experiments-Context")).toBe(false);
    const [event] = JSON.parse(request.data).events;
    expect(event.properties.source).toBe("backend");
    expect(event.session_id).toBe("visitor");
    expect(event.page_url).toBe("/checkout");
    const transport = vi.fn(async (_url: string, _init?: RequestInit) => new Response("ok"));
    await client.fetchWithAuth("/api/child", { fetch: transport });
    expect(new Headers(transport.mock.calls[0][1]?.headers).get("Base44-Experiments-Context")).toBe(encode(context));
    client.setToken("different-user-token");
    await client.fetchWithAuth("/api/child", { fetch: transport });
    expect(new Headers(transport.mock.calls[1][1]?.headers).has("Base44-Experiments-Context")).toBe(false);
    client.cleanup();
  });

  test("browser waits for its token identity while retaining SSR flags and forwarding visitor/preview", async () => {
    vi.stubGlobal("window", {
      __B44_EXPERIMENTS_BOOTSTRAP__: { ...context, preview: { checkout: false } },
      location: { origin: "https://app.example", pathname: "/checkout" },
      localStorage: { getItem: () => "user-token", setItem: () => {} },
    });
    vi.stubGlobal("document", {});
    const client = createClient({ appId: "app", token: "user-token", analytics: { enabled: false } });
    expect(client.experiments.getSnapshot()).toEqual({ flags: {}, isLoading: true });
    expect(client.experiments.getServerSnapshot()).toEqual({ flags: { checkout: false }, isLoading: false });
    const transport = vi.fn(async (_url: string, _init?: RequestInit) => new Response("ok"));
    await client.fetchWithAuth("/api/checkout", { fetch: transport });
    const headers = new Headers(transport.mock.calls[0][1]?.headers);
    expect(headers.get("Base44-Visitor-Id")).toBe("visitor");
    expect(headers.get("Base44-Experiment-Preview")).toBe('{"checkout":false}');
    client.cleanup();
  });

  test.each([false, true])("browser goals preserve bootstrap preview %s without a URL override", async (value) => {
    vi.useFakeTimers();
    const preview = Object.assign(Object.create({ unrelated: true }), { checkout: value });
    const browserContext = { ...context, identity: { visitorId: "visitor", userId: null }, preview };
    vi.stubGlobal("window", {
      __B44_EXPERIMENTS_BOOTSTRAP__: browserContext,
      location: { origin: "https://app.example", pathname: "/checkout", search: "" },
      localStorage: { getItem: () => null, setItem: () => {} },
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    });
    vi.stubGlobal("document", { referrer: "" });
    const adapter = captureAnalytics();
    const client = createClient({ appId: "app" });
    client.analytics.track({ eventName: "purchase", properties: {
      amount: 42, __b44_experiment_preview: '{"unrelated":true}',
    } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(adapter).toHaveBeenCalledOnce();
    const [event] = JSON.parse(adapter.mock.calls[0][0].data).events;
    expect(event).toMatchObject({ event_name: "purchase", session_id: "visitor", properties: {
      amount: 42, __b44_experiment_preview: JSON.stringify({ checkout: value }),
    } });
    client.cleanup();
  });

  test.each([false, true])("Worker goals retain request-scoped preview %s and all user properties", async (value) => {
    vi.useFakeTimers();
    const adapter = captureAnalytics();
    const requestContext = { ...context, identity: { visitorId: "worker-visitor", userId: null }, preview: { checkout: value } };
    const client = createClientFromRequest(new Request("https://app.example/checkout", { headers: {
      "Base44-App-Id": "app", "Base44-Experiments-Context": encode(requestContext),
    } }));
    const properties = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`item_${index}`, index]));
    client.analytics.track({ eventName: "purchase", properties });
    await vi.advanceTimersByTimeAsync(1000);
    const [event] = JSON.parse(adapter.mock.calls[0][0].data).events;
    expect(event).toMatchObject({ event_name: "purchase", session_id: "worker-visitor", properties: {
      ...properties, __b44_experiment_preview: JSON.stringify({ checkout: value }),
    } });
    expect(Object.keys(event.properties)).toHaveLength(51);
    expect(Object.keys(properties)).toHaveLength(50);
    client.cleanup();
  });

  test("queued goals keep occurrence-time previews while normal goals stay unchanged", async () => {
    vi.useFakeTimers();
    const adapter = captureAnalytics();
    const experimentsContext: ExperimentsContext = {
      ...context, identity: { visitorId: "visitor", userId: null }, preview: {},
    };
    const client = createClient({ appId: "app", experiments: experimentsContext });
    client.analytics.track({ eventName: "warmup" });
    await vi.advanceTimersByTimeAsync(0);
    experimentsContext.preview = { checkout: false };
    client.analytics.track({ eventName: "preview_purchase", properties: { amount: 42 } });
    experimentsContext.preview = {};
    client.analytics.track({ eventName: "normal_purchase", properties: { amount: 42 } });
    client.analytics.track({ eventName: "reserved_collision", properties: { __b44_experiment_preview: '{"checkout":true}' } });
    await vi.advanceTimersByTimeAsync(1000);
    const events = adapter.mock.calls.flatMap(([request]) => JSON.parse(request.data).events);
    expect(events.map(({ event_name, properties }) => ({ event_name, properties }))).toEqual([
      { event_name: "warmup", properties: undefined },
      { event_name: "preview_purchase", properties: { amount: 42, __b44_experiment_preview: '{"checkout":false}' } },
      { event_name: "normal_purchase", properties: { amount: 42 } },
      { event_name: "reserved_collision", properties: {} },
    ]);
    client.cleanup();
  });
});
