import { afterEach, beforeEach, describe, expect, test } from "vitest";
import nock from "nock";
import { Base44Error, createClient } from "../../src/index.ts";

describe("MCP module", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const token = "user-token-456";
  const ctx = "handle/with+chars";
  let base44: ReturnType<typeof createClient>;
  let scope: nock.Scope;

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId, token });
    scope = nock(serverUrl);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test("getConsentInfo looks up the request by its handle as the signed-in user", async () => {
    const info = {
      app_name: "My App",
      client_name: "Claude",
      authenticated: true,
      tools: [{ name: "list_tasks", title: "List tasks", description: null }],
      login_path: "/login",
    };
    scope
      .get(`/api/apps/${appId}/mcp/consent-info`)
      .query({ handle: ctx })
      .matchHeader("Authorization", `Bearer ${token}`)
      .reply(200, info);

    await expect(base44.mcp.getConsentInfo(ctx)).resolves.toEqual(info);
    expect(scope.isDone()).toBe(true);
  });

  test("getConsentInfo sends no Authorization header without a token, leaving the cookie to identify the user", async () => {
    const anonymous = createClient({ serverUrl, appId });
    scope
      .get(`/api/apps/${appId}/mcp/consent-info`)
      .query({ handle: ctx })
      .matchHeader("Authorization", (value) => value === undefined)
      .reply(200, { authenticated: false, tools: [], login_path: "/login" });

    await anonymous.mcp.getConsentInfo(ctx);

    expect(scope.isDone()).toBe(true);
  });

  test.each(["approve", "deny"] as const)(
    "authorizeGrant posts the %s decision and returns the client redirect",
    async (action) => {
      const redirect_url = "https://client.example/callback?code=abc";
      scope
        .post(`/api/apps/${appId}/mcp/authorize-grant`, { ctx, action })
        .matchHeader("Authorization", `Bearer ${token}`)
        .reply(200, { redirect_url });

      await expect(base44.mcp.authorizeGrant(ctx, action)).resolves.toEqual({
        redirect_url,
      });
      expect(scope.isDone()).toBe(true);
    }
  );

  test("authorizeGrant rejects with the server's status and detail", async () => {
    scope
      .post(`/api/apps/${appId}/mcp/authorize-grant`)
      .reply(409, { detail: "The app's tools changed. Reconnect." });

    const error = await base44.mcp
      .authorizeGrant(ctx, "approve")
      .catch((e) => e);

    expect(error).toBeInstanceOf(Base44Error);
    expect(error.status).toBe(409);
    expect(error.message).toBe("The app's tools changed. Reconnect.");
  });
});
