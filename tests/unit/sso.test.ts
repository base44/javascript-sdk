import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createClient } from "../../src/index.ts";
import { platform } from "../mocks/platform";

describe("SSO module", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const serviceToken = "service-token-123";
  const userToken = "user-token-456";
  const userId = "user_123";
  let base44: ReturnType<typeof createClient>;

  beforeEach(() => {
    platform.given.app(appId).sso.tokens(userId, {
      idToken: "header.payload.signature",
      accessToken: "access-token-123",
    });
    base44 = createClient({ serverUrl, appId, token: userToken, serviceToken });
  });

  afterEach(() => base44.cleanup());

  test("getIdToken issues the app-scoped GET request and returns the raw token", async () => {
    await expect(base44.asServiceRole.sso.getIdToken(userId)).resolves.toBe(
      "header.payload.signature",
    );
    expect(platform.requests.last("sso.getIdToken").url).toContain(
      `/api/apps/${appId}/auth/sso/idtoken/${userId}`,
    );
  });

  test("getAccessToken issues the existing GET request and returns the raw token", async () => {
    await expect(base44.asServiceRole.sso.getAccessToken(userId)).resolves.toBe(
      "access-token-123",
    );
  });

  test("getIdToken uses the service-role client with on-behalf-of authentication", async () => {
    await base44.asServiceRole.sso.getIdToken(userId);
    const request = platform.requests.last("sso.getIdToken");
    expect(request.headers.authorization).toBe(`Bearer ${serviceToken}`);
    expect(request.headers["on-behalf-of"]).toBe(`Bearer ${userToken}`);
  });

  test("getIdToken surfaces a 404 when no ID token is stored", async () => {
    platform.given
      .app(appId)
      .sso.tokens("another-user", { accessToken: "only-access" });
    await expect(
      base44.asServiceRole.sso.getIdToken("another-user"),
    ).rejects.toMatchObject({
      name: "Base44Error",
      status: 404,
      code: "NOT_FOUND",
    });
  });
});
