import axios from "axios";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createClient, createClientFromRequest } from "../../src/client.js";
import type { ExperimentsContext } from "../../src/modules/experiments-config.types.js";

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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
});
