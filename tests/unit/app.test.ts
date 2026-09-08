import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Base44Error, createClient } from "../../src/index.ts";
import { platform } from "../mocks/platform";

describe("App module", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const token = "user-token-456";
  let base44: ReturnType<typeof createClient>;

  beforeEach(() => {
    platform.given.app.publicSettings({ id: appId, public_settings: "public_without_login" });
    base44 = createClient({ serverUrl, appId, token });
  });

  afterEach(() => base44.cleanup());

  test("getPublicSettings returns the app id and its access policy", async () => {
    await expect(base44.app.getPublicSettings()).resolves.toEqual({
      id: appId,
      public_settings: "public_without_login",
    });
  });

  test("getPublicSettings authenticates with the client's token, so callers never handle it", async () => {
    await base44.app.getPublicSettings();
    expect(platform.requests.last("app.getPublicSettings").headers.authorization).toBe(`Bearer ${token}`);
  });

  test("getPublicSettings sends no Authorization header for an anonymous client", async () => {
    const anonymous = createClient({ serverUrl, appId });
    await anonymous.app.getPublicSettings();
    expect(platform.requests.last("app.getPublicSettings").headers.authorization).toBeUndefined();
    anonymous.cleanup();
  });

  test.each([
    ["auth_required", "the visitor must sign in"],
    ["user_not_registered", "the visitor has no access to this app"],
  ] as const)(
    "getPublicSettings surfaces a 403 %s as a Base44Error carrying the reason",
    async (reason) => {
      platform.given.app.legacyAccessDenied(appId, reason);
      const error = await base44.app.getPublicSettings().catch((rejection) => rejection);
      expect(error).toBeInstanceOf(Base44Error);
      expect(error.status).toBe(403);
      expect(error.data.extra_data.reason).toBe(reason);
    },
  );
});
