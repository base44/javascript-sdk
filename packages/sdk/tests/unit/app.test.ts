import { afterEach, beforeEach, describe, expect, test } from "vitest";
import nock from "nock";
import { Base44Error, createClient } from "../../src/index.ts";

describe("App module", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const token = "user-token-456";
  const publicSettingsPath = `/api/apps/public/prod/public-settings/by-id/${appId}`;
  let base44: ReturnType<typeof createClient>;
  let scope: nock.Scope;

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId, token });
    scope = nock(serverUrl);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test("getPublicSettings returns the app id and its access policy", async () => {
    scope
      .get(publicSettingsPath)
      .reply(200, { id: appId, public_settings: "public_without_login" });

    const settings = await base44.app.getPublicSettings();

    expect(settings).toEqual({
      id: appId,
      public_settings: "public_without_login",
    });
    expect(scope.isDone()).toBe(true);
  });

  test("getPublicSettings authenticates with the client's token, so callers never handle it", async () => {
    scope
      .get(publicSettingsPath)
      .matchHeader("Authorization", `Bearer ${token}`)
      .reply(200, { id: appId, public_settings: "private_with_login" });

    await base44.app.getPublicSettings();

    expect(scope.isDone()).toBe(true);
  });

  test("getPublicSettings sends no Authorization header for an anonymous client", async () => {
    const anonymous = createClient({ serverUrl, appId });

    scope
      .get(publicSettingsPath)
      .matchHeader("Authorization", (value) => value === undefined)
      .reply(200, { id: appId, public_settings: "public_without_login" });

    await anonymous.app.getPublicSettings();

    expect(scope.isDone()).toBe(true);
  });

  test.each([
    ["auth_required", "the visitor must sign in"],
    ["user_not_registered", "the visitor has no access to this app"],
  ])(
    "getPublicSettings surfaces a 403 %s as a Base44Error carrying the reason",
    async (reason) => {
      scope
        .get(publicSettingsPath)
        .reply(403, { extra_data: { app_id: appId, reason } });

      const error = await base44.app
        .getPublicSettings()
        .catch((rejection) => rejection);

      expect(error).toBeInstanceOf(Base44Error);
      expect(error.status).toBe(403);
      expect(error.data.extra_data.reason).toBe(reason);
    }
  );
});
