import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/index.ts";
import { platform } from "../mocks/platform/index.ts";

const responded = {
  success: true,
  phase: "responded" as const,
  status: 201,
  data: { data: { id: "1" } },
  headers: { "x-rate-limit-remaining": "42" },
  creditsCharged: 3,
};

describe("Connectors module – metered connector proxy", () => {
  let base44: ReturnType<typeof createClient>;

  beforeEach(() => {
    base44 = createClient({ serverUrl: "https://base44.app", appId: "test-app-id", serviceToken: "service-token-123" });
    platform.given.connectors.proxyOutcome("x", responded);
  });
  afterEach(() => base44.cleanup());

  test("posts the normalized request to the shared-connector proxy route", async () => {
    await base44.asServiceRole.connectors.callApi("x", { method: "POST", path: "/2/tweets", body: { text: "hi" } });
    expect(platform.requests.last("connectors.callApi")).toMatchObject({
      method: "POST",
      headers: { authorization: "Bearer service-token-123" },
      body: { method: "POST", path: "/2/tweets", body: { text: "hi" }, query: {}, headers: {} },
    });
  });

  test("percent-encodes the integration type so it stays on the connectors route", async () => {
    platform.given.connectors.proxyOutcome("../evil/route", responded);
    const result = await base44.asServiceRole.connectors.callApi("../evil/route" as any, { path: "/x" });
    expect(result.success).toBe(true);
    expect(platform.requests.last("connectors.callApi").url).toContain("connectors/..%2Fevil%2Froute/call");
  });

  test("forwards a named host, and omits it entirely when unset", async () => {
    platform.given.connectors.proxyOutcome("googlemaps", responded);
    await base44.asServiceRole.connectors.callApi("googlemaps", { host: "places", path: "/v1/places:searchText" });
    await base44.asServiceRole.connectors.callApi("googlemaps", { path: "/maps/api/geocode/json" });
    await base44.asServiceRole.connectors.callApi("googlemaps", { host: null as any, path: "/maps/api/geocode/json" });
    const bodies = platform.requests.all("connectors.callApi").map((request) => request.body as Record<string, unknown>);
    expect(bodies[0].host).toBe("places");
    expect("host" in bodies[1]).toBe(false);
    expect("host" in bodies[2]).toBe(false);
  });

  test("maps a binary response to dataBase64 + contentType", async () => {
    platform.given.connectors.proxyOutcome("googlemaps", {
      success: true, phase: "responded", status: 200, data: null,
      dataBase64: "iVBORw0KGgo=", contentType: "image/png", creditsCharged: 1,
    });
    const result = await base44.asServiceRole.connectors.callApi("googlemaps", { path: "/maps/api/staticmap" });
    expect(result).toMatchObject({ dataBase64: "iVBORw0KGgo=", contentType: "image/png", data: null });
  });

  test("leaves dataBase64 and contentType null for a JSON response", async () => {
    const result = await base44.asServiceRole.connectors.callApi("x", { path: "/2/users/me" });
    expect(result.dataBase64).toBeNull();
    expect(result.contentType).toBeNull();
  });

  test("defaults the method to GET", async () => {
    await base44.asServiceRole.connectors.callApi("x", { path: "/2/users/me" });
    expect(platform.requests.last("connectors.callApi").body).toMatchObject({ method: "GET" });
  });

  test("forwards query parameters so the priced call matches the sent call", async () => {
    const query = { query: "base44", max_results: 10 };
    await base44.asServiceRole.connectors.callApi("x", { path: "/2/tweets/search/recent", query });
    expect(platform.requests.last("connectors.callApi").body).toMatchObject({ query });
  });

  test("maps the proxy envelope to camelCase", async () => {
    const result = await base44.asServiceRole.connectors.callApi("x", { path: "/2/tweets" });
    expect(result).toEqual({
      success: true, phase: "responded", status: 201, data: { data: { id: "1" } },
      dataBase64: null, contentType: null, headers: { "x-rate-limit-remaining": "42" }, creditsCharged: 3,
    });
  });

  test("returns an upstream error instead of throwing", async () => {
    platform.given.connectors.proxyOutcome("x", {
      success: false, phase: "responded", status: 400,
      data: { title: "Invalid Request" }, creditsCharged: 3,
    });
    const result = await base44.asServiceRole.connectors.callApi("x", { method: "POST", path: "/2/tweets", body: {} });
    expect(result).toMatchObject({
      success: false, phase: "responded", status: 400,
      data: { title: "Invalid Request" }, creditsCharged: 3,
    });
  });

  test("rejects when Base44 itself refuses the call", async () => {
    platform.given.faults.connectors.creditsExhausted("x");
    await expect(base44.asServiceRole.connectors.callApi("x", { path: "/2/tweets" })).rejects.toMatchObject({ status: 402 });
    await expect(base44.asServiceRole.connectors.callApi("x", { path: "/2/tweets" })).resolves.toMatchObject({
      success: true,
      status: 201,
    });
  });

  test("a metered connector's token request surfaces the actionable refusal", async () => {
    platform.given.faults.connectors.meteredTokenRequiresProxy("x");
    await expect(base44.asServiceRole.connectors.getConnection("x")).rejects.toMatchObject({
      status: 403,
      code: "metered_connector_requires_proxy",
      message: expect.stringContaining("/connectors/x/call"),
    });
  });

  test.each(["post", "TRACE"])("rejects unsupported request method %s before sending", async (method) => {
    await expect(base44.asServiceRole.connectors.callApi("x", { method: method as any, path: "/2/tweets" })).rejects.toThrow(
      "Request method must be one of GET, POST, PUT, PATCH, DELETE, or HEAD",
    );
    expect(platform.requests.count("connectors.callApi")).toBe(0);
  });

  test.each(["not_sent", "timed_out", "sent_unconfirmed"] as const)(
    "maps proxy phase %s when no upstream response is available",
    async (phase) => {
      platform.given.connectors.proxyOutcome("x", {
        success: false, phase, status: null, data: { error: "request outcome unknown" },
        creditsCharged: phase === "not_sent" ? 0 : 3,
      });
      const result = await base44.asServiceRole.connectors.callApi("x", { path: "/2/tweets" });
      expect(result).toMatchObject({ phase, status: null, success: false });
    },
  );

  test.each([["", "/2/tweets"], ["x", ""]])("rejects a missing identifier or path (%s, %s)", async (type, path) => {
    await expect(base44.asServiceRole.connectors.callApi(type, { path })).rejects.toThrow(/required and must be a string/);
  });
});
