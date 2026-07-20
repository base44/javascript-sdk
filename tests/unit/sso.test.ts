import { afterEach, beforeEach, describe, expect, test } from "vitest";
import nock from "nock";
import { createClient } from "../../src/index.ts";

describe("SSO module", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const serviceToken = "service-token-123";
  const userToken = "user-token-456";
  const userId = "user_123";
  let base44: ReturnType<typeof createClient>;
  let scope: nock.Scope;

  beforeEach(() => {
    base44 = createClient({
      serverUrl,
      appId,
      token: userToken,
      serviceToken,
    });
    scope = nock(serverUrl);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test("getIdToken issues the app-scoped GET request and returns the raw token", async () => {
    const rawIdToken = "header.payload.signature";

    scope
      .get(`/api/apps/${appId}/auth/sso/idtoken/${userId}`)
      .reply(200, JSON.stringify(rawIdToken), {
        "Content-Type": "application/json",
      });

    const idToken: string =
      await base44.asServiceRole.sso.getIdToken(userId);

    expect(idToken).toBe(rawIdToken);
    expect(scope.isDone()).toBe(true);
  });

  test("getAccessToken keeps its existing request and return behavior", async () => {
    const accessTokenResponse = { access_token: "access-token-123" };

    scope
      .get(`/api/apps/${appId}/auth/sso/accesstoken/${userId}`)
      .reply(200, accessTokenResponse);

    const response =
      await base44.asServiceRole.sso.getAccessToken(userId);

    expect(response).toEqual(accessTokenResponse);
    expect(scope.isDone()).toBe(true);
  });

  test("getIdToken uses the service-role client with on-behalf-of authentication", async () => {
    scope
      .get(`/api/apps/${appId}/auth/sso/idtoken/${userId}`)
      .matchHeader("Authorization", `Bearer ${serviceToken}`)
      .matchHeader("on-behalf-of", `Bearer ${userToken}`)
      .reply(200, JSON.stringify("raw-id-token"), {
        "Content-Type": "application/json",
      });

    await base44.asServiceRole.sso.getIdToken(userId);

    expect(scope.isDone()).toBe(true);
  });
});
