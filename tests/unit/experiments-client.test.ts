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
