import { describe, test, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { createClient } from "../../src/index.ts";

describe("Connectors module – metered connector proxy", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const serviceToken = "service-token-123";
  let base44: ReturnType<typeof createClient>;
  let scope: nock.Scope;

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId, serviceToken });
    scope = nock(serverUrl);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  const proxyResponse = {
    success: true,
    status_code: 201,
    data: { data: { id: "1" } },
    headers: { "x-rate-limit-remaining": "42" },
    credits_charged: 3,
  };

  test("posts the normalized request to the shared-connector proxy route", async () => {
    let received: any;
    scope
      .post(`/api/apps/${appId}/connectors/x/call`, (body) => {
        received = body;
        return true;
      })
      .reply(200, proxyResponse);

    await base44.asServiceRole.connectors.callApi("x", {
      method: "post",
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

  test("defaults the method to GET", async () => {
    let received: any;
    scope
      .post(`/api/apps/${appId}/connectors/x/call`, (body) => {
        received = body;
        return true;
      })
      .reply(200, proxyResponse);

    await base44.asServiceRole.connectors.callApi("x", { path: "/2/users/me" });

    expect(received.method).toBe("GET");
  });

  test("forwards query parameters so the priced call matches the sent call", async () => {
    // The server prices the merged query; dropping it client-side would make the
    // quoted price and the real request disagree.
    let received: any;
    scope
      .post(`/api/apps/${appId}/connectors/x/call`, (body) => {
        received = body;
        return true;
      })
      .reply(200, proxyResponse);

    await base44.asServiceRole.connectors.callApi("x", {
      path: "/2/tweets/search/recent",
      query: { query: "base44", max_results: 10 },
    });

    expect(received.query).toEqual({ query: "base44", max_results: 10 });
  });

  test("maps the proxy envelope to camelCase", async () => {
    scope.post(`/api/apps/${appId}/connectors/x/call`).reply(200, proxyResponse);

    const res = await base44.asServiceRole.connectors.callApi("x", {
      path: "/2/tweets",
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe(201);
    expect(res.data).toEqual({ data: { id: "1" } });
    expect(res.headers).toEqual({ "x-rate-limit-remaining": "42" });
    expect(res.creditsCharged).toBe(3);
  });

  test("returns an upstream error instead of throwing", async () => {
    // A provider 4xx is a normal outcome of a call Base44 completed (and billed),
    // so it must be inspectable rather than an exception.
    scope.post(`/api/apps/${appId}/connectors/x/call`).reply(200, {
      success: false,
      status_code: 400,
      data: { title: "Invalid Request" },
      headers: {},
      credits_charged: 3,
    });

    const res = await base44.asServiceRole.connectors.callApi("x", {
      method: "POST",
      path: "/2/tweets",
      body: {},
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe(400);
    expect(res.data).toEqual({ title: "Invalid Request" });
    // Still charged: the vendor counted the request.
    expect(res.creditsCharged).toBe(3);
  });

  test("rejects when Base44 itself refuses the call", async () => {
    // Credits exhausted is a Base44-side failure, not an upstream outcome.
    scope.post(`/api/apps/${appId}/connectors/x/call`).reply(402, {
      message: "You have reached the limit of integrations for this month",
      extra_data: { reason: "integration_credits_limit_reached" },
    });

    await expect(
      base44.asServiceRole.connectors.callApi("x", { path: "/2/tweets" })
    ).rejects.toMatchObject({ status: 402 });
  });

  test("a metered connector's token request surfaces the actionable refusal", async () => {
    // The backend's 403 detail names the proxy, which is what lets generated
    // code (and the model that wrote it) correct itself.
    scope.get(`/api/apps/${appId}/external-auth/tokens/x`).reply(
      403,
      {
        detail:
          "Connector 'x' is metered — raw access tokens are not available for it. " +
          `Call POST /api/apps/${appId}/connectors/x/call instead.`,
      },
      { "X-Base44-Connector-Error": "metered_connector_requires_proxy" }
    );

    await expect(
      base44.asServiceRole.connectors.getConnection("x")
    ).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("/connectors/x/call"),
    });
  });

  test.each([
    ["", "/2/tweets"],
    ["x", ""],
  ])("rejects a missing identifier or path (%s, %s)", async (type, path) => {
    await expect(
      base44.asServiceRole.connectors.callApi(type, { path })
    ).rejects.toThrow(/required and must be a string/);
  });
});
