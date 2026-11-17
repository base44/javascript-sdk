import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import nock from "nock";
import type { AxiosInstance } from "axios";
import { Base44Error, createClient } from "../../src/index.ts";
import { createMcpModule } from "../../src/modules/mcp.ts";

describe("MCP module", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const token = "user-token-456";
  const ctx = "handle/with spaces&more";
  const consentInfoPath = `/api/apps/${appId}/mcp/consent-info`;
  const authorizeGrantPath = `/api/apps/${appId}/mcp/authorize-grant`;
  let scope: nock.Scope;

  beforeEach(() => {
    scope = nock(serverUrl);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test("getConsentInfo sends the handle and the client's token", async () => {
    const info = {
      app_name: "My App",
      client_name: "Claude",
      authenticated: true,
      tools: [{ name: "read_todo", kind: "entity", entity: "Todo", operation: "read" }],
      login_path: "/login",
    };
    scope
      .get(consentInfoPath)
      .query({ handle: ctx })
      .matchHeader("Authorization", `Bearer ${token}`)
      .reply(200, info);

    const base44 = createClient({ serverUrl, appId, token });

    expect(await base44.mcp.getConsentInfo(ctx)).toEqual(info);
    expect(scope.isDone()).toBe(true);
  });

  test("getConsentInfo sends no Authorization header without a token, so it can't shadow the session cookie", async () => {
    scope
      .get(consentInfoPath)
      .query({ handle: ctx })
      .matchHeader("Authorization", (value) => value === undefined)
      .reply(200, { authenticated: false, tools: [], login_path: "/login" });

    await createClient({ serverUrl, appId }).mcp.getConsentInfo(ctx);

    expect(scope.isDone()).toBe(true);
  });

  test("respondToConsent posts the decision and returns the redirect", async () => {
    scope
      .post(authorizeGrantPath, { ctx, action: "deny" })
      .matchHeader("Authorization", `Bearer ${token}`)
      .reply(200, { redirect_url: "cursor://callback?error=access_denied" });

    const base44 = createClient({ serverUrl, appId, token });

    expect(await base44.mcp.respondToConsent(ctx, "deny")).toEqual({
      redirect_url: "cursor://callback?error=access_denied",
    });
    expect(scope.isDone()).toBe(true);
  });

  test("respondToConsent rejects with the status and server detail", async () => {
    scope
      .post(authorizeGrantPath)
      .reply(409, { detail: "The tools this app exposes changed." });

    const base44 = createClient({ serverUrl, appId, token });

    const error = await base44.mcp.respondToConsent(ctx, "approve").catch((e) => e);

    expect(error).toBeInstanceOf(Base44Error);
    expect(error.status).toBe(409);
    expect(error.message).toBe("The tools this app exposes changed.");
  });

  test("both calls send the session cookie", async () => {
    const axios = { get: vi.fn(), post: vi.fn() };
    const mcp = createMcpModule(axios as unknown as AxiosInstance, appId);

    await mcp.getConsentInfo(ctx);
    await mcp.respondToConsent(ctx, "approve");

    expect(axios.get.mock.calls[0][1]).toMatchObject({ withCredentials: true });
    expect(axios.post.mock.calls[0][2]).toMatchObject({ withCredentials: true });
  });
});
