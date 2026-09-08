import { mockHttp } from "../mocks/http";
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/index.ts";

describe("Connectors module – metered connector proxy", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const serviceToken = "service-token-123";
  let base44: ReturnType<typeof createClient>;

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId, serviceToken });
  });

  afterEach(() => {
    base44.cleanup();
  });

  const proxyResponse = {
    success: true,
    phase: "responded",
    status_code: 201,
    data: { data: { id: "1" } },
    headers: { "x-rate-limit-remaining": "42" },
    credits_charged: 3,
  };

  test("posts the normalized request to the shared-connector proxy route", async () => {
    let received: any;
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/connectors/x/call`,
      body: (body) => {
        received = body;
        return true;
      },
      status: 200,
      response: proxyResponse,
    });

    await base44.asServiceRole.connectors.callApi("x", {
      method: "POST",
      path: "/2/tweets",
      body: { text: "hi" },
    });

    expect(received.method).toBe("POST");
    expect(received.path).toBe("/2/tweets");
    expect(received.body).toEqual({ text: "hi" });
    // Absent fields are sent as empties rather than omitted, so the server
    // never has to distinguish "missing" from "empty".
    expect(received.query).toEqual({});
    expect(received.headers).toEqual({});
  });

  test("percent-encodes the integration type so it stays on the connectors route", async () => {
    // The route carries the service-role token, so a runtime-built identifier
    // containing slashes must select a (nonexistent) connector, not another route.
    mockHttp({
      method: "post",
      url:
        serverUrl +
        `/api/apps/${appId}/connectors/${encodeURIComponent("../evil/route")}/call`,
      status: 200,
      response: proxyResponse,
    });

    const res = await base44.asServiceRole.connectors.callApi(
      "../evil/route" as any,
      { path: "/x" },
    );

    expect(res.success).toBe(true);
  });

  test("forwards a named host, and omits it entirely when unset", async () => {
    // The payload is built field by field, so anything not explicitly forwarded
    // is silently dropped — which is what happened to `host` before this.
    const bodies: any[] = [];
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/connectors/googlemaps/call`,
      body: (body) => {
        bodies.push(body);
        return true;
      },
      times: 3,
      status: 200,
      response: proxyResponse,
    });

    await base44.asServiceRole.connectors.callApi("googlemaps", {
      host: "places",
      path: "/v1/places:searchText",
    });
    await base44.asServiceRole.connectors.callApi("googlemaps", {
      path: "/maps/api/geocode/json",
    });
    await base44.asServiceRole.connectors.callApi("googlemaps", {
      host: null as any,
      path: "/maps/api/geocode/json",
    });

    expect(bodies[0].host).toBe("places");
    // Absent rather than null, so the proxy picks the connector's default host.
    expect("host" in bodies[1]).toBe(false);
    // Untyped callers write `host: x ?? null`; null must mean unset, not a host.
    expect("host" in bodies[2]).toBe(false);
  });

  test("maps a binary response to dataBase64 + contentType", async () => {
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/connectors/googlemaps/call`,
      status: 200,
      response: {
        success: true,
        phase: "responded",
        status_code: 200,
        data: null,
        data_base64: "iVBORw0KGgo=",
        content_type: "image/png",
        headers: {},
        credits_charged: 1,
      },
    });

    const res = await base44.asServiceRole.connectors.callApi("googlemaps", {
      path: "/maps/api/staticmap",
    });

    expect(res.dataBase64).toBe("iVBORw0KGgo=");
    expect(res.contentType).toBe("image/png");
    expect(res.data).toBeNull();
  });

  test("leaves dataBase64 and contentType null for a JSON response", async () => {
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/connectors/x/call`,
      status: 200,
      response: proxyResponse,
    });

    const res = await base44.asServiceRole.connectors.callApi("x", {
      path: "/2/users/me",
    });

    expect(res.dataBase64).toBeNull();
    expect(res.contentType).toBeNull();
  });

  test("defaults the method to GET", async () => {
    let received: any;
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/connectors/x/call`,
      body: (body) => {
        received = body;
        return true;
      },
      status: 200,
      response: proxyResponse,
    });

    await base44.asServiceRole.connectors.callApi("x", { path: "/2/users/me" });

    expect(received.method).toBe("GET");
  });

  test("forwards query parameters so the priced call matches the sent call", async () => {
    // The server prices the merged query; dropping it client-side would make the
    // quoted price and the real request disagree.
    let received: any;
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/connectors/x/call`,
      body: (body) => {
        received = body;
        return true;
      },
      status: 200,
      response: proxyResponse,
    });

    await base44.asServiceRole.connectors.callApi("x", {
      path: "/2/tweets/search/recent",
      query: { query: "base44", max_results: 10 },
    });

    expect(received.query).toEqual({ query: "base44", max_results: 10 });
  });

  test("maps the proxy envelope to camelCase", async () => {
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/connectors/x/call`,
      status: 200,
      response: proxyResponse,
    });

    const res = await base44.asServiceRole.connectors.callApi("x", {
      path: "/2/tweets",
    });

    expect(res.success).toBe(true);
    expect(res.phase).toBe("responded");
    expect(res.status).toBe(201);
    expect(res.data).toEqual({ data: { id: "1" } });
    expect(res.headers).toEqual({ "x-rate-limit-remaining": "42" });
    expect(res.creditsCharged).toBe(3);
  });

  test("returns an upstream error instead of throwing", async () => {
    // A provider 4xx is a normal outcome of a call Base44 completed (and billed),
    // so it must be inspectable rather than an exception.
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/connectors/x/call`,
      status: 200,
      response: {
        success: false,
        phase: "responded",
        status_code: 400,
        data: { title: "Invalid Request" },
        headers: {},
        credits_charged: 3,
      },
    });

    const res = await base44.asServiceRole.connectors.callApi("x", {
      method: "POST",
      path: "/2/tweets",
      body: {},
    });

    expect(res.success).toBe(false);
    expect(res.phase).toBe("responded");
    expect(res.status).toBe(400);
    expect(res.data).toEqual({ title: "Invalid Request" });
    // Still charged: the vendor counted the request.
    expect(res.creditsCharged).toBe(3);
  });

  test("rejects when Base44 itself refuses the call", async () => {
    // Credits exhausted is a Base44-side failure, not an upstream outcome.
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/connectors/x/call`,
      status: 402,
      response: {
        message: "You have reached the limit of integrations for this month",
        extra_data: { reason: "integration_credits_limit_reached" },
      },
    });

    await expect(
      base44.asServiceRole.connectors.callApi("x", { path: "/2/tweets" }),
    ).rejects.toMatchObject({ status: 402 });
  });

  test("a metered connector's token request surfaces the actionable refusal", async () => {
    // The backend's 403 detail names the proxy, which is what lets generated
    // code (and the model that wrote it) correct itself.
    mockHttp({
      method: "get",
      url: serverUrl + `/api/apps/${appId}/external-auth/tokens/x`,
      status: 403,
      response: {
        detail:
          "Connector 'x' is metered — raw access tokens are not available for it. " +
          `Call POST /api/apps/${appId}/connectors/x/call instead.`,
      },
      responseHeaders: {
        "X-Base44-Connector-Error": "metered_connector_requires_proxy",
      },
    });

    await expect(
      base44.asServiceRole.connectors.getConnection("x"),
    ).rejects.toMatchObject({
      status: 403,
      code: "metered_connector_requires_proxy",
      message: expect.stringContaining("/connectors/x/call"),
    });
  });

  test.each(["post", "TRACE"])(
    "rejects unsupported request method %s before sending",
    async (method) => {
      await expect(
        base44.asServiceRole.connectors.callApi("x", {
          method: method as any,
          path: "/2/tweets",
        }),
      ).rejects.toThrow(
        "Request method must be one of GET, POST, PUT, PATCH, DELETE, or HEAD",
      );
    },
  );

  test.each(["not_sent", "timed_out", "sent_unconfirmed"] as const)(
    "maps proxy phase %s when no upstream response is available",
    async (phase) => {
      mockHttp({
        method: "post",
        url: serverUrl + `/api/apps/${appId}/connectors/x/call`,
        status: 200,
        response: {
          success: false,
          phase,
          status_code: null,
          data: { error: "request outcome unknown" },
          headers: {},
          credits_charged: phase === "not_sent" ? 0 : 3,
        },
      });

      const res = await base44.asServiceRole.connectors.callApi("x", {
        path: "/2/tweets",
      });

      expect(res.phase).toBe(phase);
      expect(res.status).toBeNull();
      expect(res.success).toBe(false);
    },
  );

  test.each([
    ["", "/2/tweets"],
    ["x", ""],
  ])("rejects a missing identifier or path (%s, %s)", async (type, path) => {
    await expect(
      base44.asServiceRole.connectors.callApi(type, { path }),
    ).rejects.toThrow(/required and must be a string/);
  });
});
