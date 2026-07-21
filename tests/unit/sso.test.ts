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

  test("getAccessToken issues the existing GET request and returns the raw token", async () => {
    const rawAccessToken = "access-token-123";

    scope
      .get(`/api/apps/${appId}/auth/sso/accesstoken/${userId}`)
      .reply(200, JSON.stringify(rawAccessToken), {
        "Content-Type": "application/json",
      });

    const accessToken =
      await base44.asServiceRole.sso.getAccessToken(userId);

    // Preserve the legacy public response type for compatibility while
    // locking down the endpoint's existing raw-string runtime behavior.
    expect(accessToken).toBe(rawAccessToken);
    expect(scope.isDone()).toBe(true);
  });

  test("getIdToken uses the service-role client with on-behalf-of authentication", async () => {
    const rawIdToken = "raw-id-token";

    scope
      .get(`/api/apps/${appId}/auth/sso/idtoken/${userId}`)
      .matchHeader("Authorization", `Bearer ${serviceToken}`)
      .matchHeader("on-behalf-of", `Bearer ${userToken}`)
      .reply(200, JSON.stringify(rawIdToken), {
        "Content-Type": "application/json",
      });

    const idToken = await base44.asServiceRole.sso.getIdToken(userId);

    expect(idToken).toBe(rawIdToken);
    expect(scope.isDone()).toBe(true);
  });

  test("getIdToken surfaces a 404 when no ID token is stored", async () => {
    scope
      .get(`/api/apps/${appId}/auth/sso/idtoken/${userId}`)
      .reply(404, { detail: "No ID token stored", code: "NOT_FOUND" });

    await expect(
      base44.asServiceRole.sso.getIdToken(userId)
    ).rejects.toMatchObject({
      name: "Base44Error",
      status: 404,
      code: "NOT_FOUND",
    });

    expect(scope.isDone()).toBe(true);
  });
});
