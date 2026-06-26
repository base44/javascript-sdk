import nock from "nock";
import { afterEach, describe, expect, test } from "vitest";

import { createClient } from "../../src/index.ts";


const appId = "test-app-id";
const serverUrl = "https://api.base44.com";


afterEach(() => {
  nock.cleanAll();
  nock.enableNetConnect();
});


describe("App user secrets module", () => {
  test("stores a declared secret with user authentication", async () => {
    const scope = nock(serverUrl, {
      reqheaders: { authorization: "Bearer user-token" },
    })
      .put(`/api/apps/${appId}/app-user-secrets/provider_api_key`, {
        value: "secret-value",
      })
      .reply(200, { success: true });
    const client = createClient({ serverUrl, appId, token: "user-token" });

    await client.appUserSecrets.set("provider_api_key", "secret-value");

    expect(scope.isDone()).toBe(true);
  });

  test("reads with both user and backend-function service authentication", async () => {
    const scope = nock(serverUrl, {
      reqheaders: {
        authorization: "Bearer user-token",
        "base44-service-authorization": "Bearer service-token",
      },
    })
      .get(`/api/apps/${appId}/app-user-secrets/provider_api_key/value`)
      .reply(200, { value: "secret-value" });
    const client = createClient({
      serverUrl,
      appId,
      token: "user-token",
      serviceToken: "service-token",
    });

    const value = await client.appUserSecrets.get("provider_api_key");

    expect(value).toBe("secret-value");
    expect(scope.isDone()).toBe(true);
  });

  test("rejects reads outside a backend function", async () => {
    const client = createClient({ serverUrl, appId, token: "user-token" });

    await expect(
      client.appUserSecrets.get("provider_api_key")
    ).rejects.toThrow("App user secrets can only be read from a Base44 backend function");
  });

  test("rejects arbitrary secret keys", async () => {
    const client = createClient({ serverUrl, appId, token: "user-token" });

    await expect(
      client.appUserSecrets.set("Not Declared", "secret-value")
    ).rejects.toThrow("Secret key must start with a lowercase letter");
  });
});
