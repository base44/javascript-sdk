import { mockHttp } from "../mocks/http";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createClient } from "../../src/index.ts";

describe("SSO module", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const serviceToken = "service-token-123";
  const userToken = "user-token-456";
  const userId = "user_123";
  let base44: ReturnType<typeof createClient>;

  beforeEach(() => {
    base44 = createClient({
      serverUrl,
      appId,
      token: userToken,
      serviceToken,
    });
  });

  afterEach(() => {
    base44.cleanup();
  });

  test("getIdToken issues the app-scoped GET request and returns the raw token", async () => {
    const rawIdToken = "header.payload.signature";

    mockHttp({
      method: "get",
      url: serverUrl + `/api/apps/${appId}/auth/sso/idtoken/${userId}`,
      status: 200,
      response: JSON.stringify(rawIdToken),
      responseHeaders: {
        "Content-Type": "application/json",
      },
    });

    const idToken: string = await base44.asServiceRole.sso.getIdToken(userId);

    expect(idToken).toBe(rawIdToken);
  });

  test("getAccessToken issues the existing GET request and returns the raw token", async () => {
    const rawAccessToken = "access-token-123";

    mockHttp({
      method: "get",
      url: serverUrl + `/api/apps/${appId}/auth/sso/accesstoken/${userId}`,
      status: 200,
      response: JSON.stringify(rawAccessToken),
      responseHeaders: {
        "Content-Type": "application/json",
      },
    });

    const accessToken = await base44.asServiceRole.sso.getAccessToken(userId);

    // Preserve the legacy public response type for compatibility while
    // locking down the endpoint's existing raw-string runtime behavior.
    expect(accessToken).toBe(rawAccessToken);
  });

  test("getIdToken uses the service-role client with on-behalf-of authentication", async () => {
    const rawIdToken = "raw-id-token";

    mockHttp({
      method: "get",
      url: serverUrl + `/api/apps/${appId}/auth/sso/idtoken/${userId}`,
      headers: [
        ["Authorization", `Bearer ${serviceToken}`],
        ["on-behalf-of", `Bearer ${userToken}`],
      ],
      status: 200,
      response: JSON.stringify(rawIdToken),
      responseHeaders: {
        "Content-Type": "application/json",
      },
    });

    const idToken = await base44.asServiceRole.sso.getIdToken(userId);

    expect(idToken).toBe(rawIdToken);
  });

  test("getIdToken surfaces a 404 when no ID token is stored", async () => {
    mockHttp({
      method: "get",
      url: serverUrl + `/api/apps/${appId}/auth/sso/idtoken/${userId}`,
      status: 404,
      response: { detail: "No ID token stored", code: "NOT_FOUND" },
    });

    await expect(
      base44.asServiceRole.sso.getIdToken(userId),
    ).rejects.toMatchObject({
      name: "Base44Error",
      status: 404,
      code: "NOT_FOUND",
    });
  });
});
