import axios from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createClient, createClientFromRequest } from "../../src/client.js";

vi.mock("partysocket", () => ({ WebSocket: class {} }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function captureRequests() {
  const create = axios.create.bind(axios);
  const adapter = vi.fn(async (config) => ({
    data: config.url.endsWith("/entities/User/me")
      ? { id: config.headers.get("Authorization").replace("Bearer token-", "user-") }
      : { accepted: 1 },
    status: 200, statusText: "OK", headers: {}, config,
  }));
  vi.spyOn(axios, "create").mockImplementation((config) => {
    const api = create(config);
    api.defaults.adapter = adapter;
    return api;
  });
  const events = () => adapter.mock.calls.map(([config]) => config)
    .filter((config) => config.url.endsWith("/analytics/track/batch"))
    .flatMap((config) => JSON.parse(config.data).events.map((event: Record<string, unknown>) => ({
      url: config.url, authorization: config.headers.get("Authorization"), ...event,
    })));
  return { adapter, events };
}

function requestClient(appId: string, suffix: string) {
  const context = { config: { v: 1, app_id: appId, flags: [], experiments: [] },
    identity: { visitorId: `visitor-${suffix}`, userId: `user-${suffix}`, status: "authenticated" }, preview: {} };
  return createClientFromRequest(new Request("https://app.example/checkout", { headers: {
    "Base44-App-Id": appId, "Authorization": `Bearer token-${suffix}`,
    "Base44-Experiments-Context": Buffer.from(JSON.stringify(context)).toString("base64url"),
  } }));
}

describe("server analytics request isolation", () => {
  test.each(["app-a", "app-b"])("concurrent Worker goals keep each request's app and identity (%s)", async (secondApp) => {
    const { events } = captureRequests();
    const a = requestClient("app-a", "a");
    const b = requestClient(secondApp, "b");
    a.analytics.track({ eventName: "goal_a" });
    b.analytics.track({ eventName: "goal_b" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(events()).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_name: "goal_a", url: "/apps/app-a/analytics/track/batch",
        authorization: "Bearer token-a", user_id: "user-a", session_id: "visitor-a" }),
      expect.objectContaining({ event_name: "goal_b", url: `/apps/${secondApp}/analytics/track/batch`,
        authorization: "Bearer token-b", user_id: "user-b", session_id: "visitor-b" }),
    ]));
    expect(events()).toHaveLength(2);
    a.cleanup(); b.cleanup();
  });

  test("cleaning up one request cannot stop another request's queued goal", async () => {
    const { events } = captureRequests();
    const a = requestClient("app", "a");
    const b = requestClient("app", "b");
    a.analytics.track({ eventName: "warmup_a" });
    b.analytics.track({ eventName: "warmup_b" });
    await vi.advanceTimersByTimeAsync(0);
    b.analytics.track({ eventName: "queued_b" });
    a.cleanup();
    await vi.advanceTimersByTimeAsync(1000);
    expect(events().find((event) => event.event_name === "queued_b")).toMatchObject({
      user_id: "user-b", session_id: "visitor-b", authorization: "Bearer token-b",
    });
    b.cleanup();
  });

  test("changing one client's token resets only its own analytics identity", async () => {
    const { adapter, events } = captureRequests();
    const a = requestClient("app", "a");
    const b = requestClient("app", "b");
    a.analytics.track({ eventName: "before_a" });
    b.analytics.track({ eventName: "before_b" });
    await vi.advanceTimersByTimeAsync(1000);
    a.setToken("token-c");
    a.analytics.track({ eventName: "after_a" });
    b.analytics.track({ eventName: "after_b" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(events().find((event) => event.event_name === "after_a")).toMatchObject({ user_id: "user-c" });
    expect(events().find((event) => event.event_name === "after_b")).toMatchObject({ user_id: "user-b" });
    const meRequests = adapter.mock.calls.filter(([config]) => config.url.endsWith("/entities/User/me"));
    expect(meRequests).toHaveLength(3);
    a.cleanup(); b.cleanup();
  });

  test("anonymous server clients have independent but stable fallback visitor IDs", async () => {
    const { events } = captureRequests();
    const a = createClient({ appId: "app" });
    const b = createClient({ appId: "app" });
    a.analytics.track({ eventName: "first_a" });
    a.analytics.track({ eventName: "second_a" });
    b.analytics.track({ eventName: "first_b" });
    await vi.advanceTimersByTimeAsync(1000);
    const visitor = (name: string) => events().find((event) => event.event_name === name).session_id;
    expect(visitor("first_a")).toBeTruthy();
    expect(visitor("second_a")).toBe(visitor("first_a"));
    expect(visitor("first_b")).not.toBe(visitor("first_a"));
    a.cleanup(); b.cleanup();
  });
});
