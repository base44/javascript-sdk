import { afterEach, beforeEach, describe, expect, test } from "vitest";
import nock from "nock";
import { createPlatformClient } from "../../src/index.ts";

describe("Platform client — identity", () => {
  const serverUrl = "https://base44.app";
  const mintKey = "b44k_mint_key";
  const provisionKey = "b44k_provision_key";
  const externalId = "user_42";
  let base44: ReturnType<typeof createPlatformClient>;
  let scope: nock.Scope;

  const principalBody = {
    service_external_id: externalId,
    user_id: "u_1",
    email: "sunny-abc@org.svc.base44.invalid",
    role: "editor",
    created: true,
  };

  const tokenBody = (accessToken: string, refreshToken?: string | null) => ({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    scope: "apps:read apps:write offline",
    refresh_token: refreshToken === undefined ? "refresh-1" : refreshToken,
  });

  beforeEach(() => {
    base44 = createPlatformClient({ serverUrl, mintKey, provisionKey });
    scope = nock(serverUrl);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe("provisioning", () => {
    test("provisionPrincipal posts the snake_case body and returns camelCase", async () => {
      scope
        .post("/api/service/users", {
          service_external_id: externalId,
          display_name: "Dana",
          role: "editor",
        })
        .reply(200, principalBody);

      const principal = await base44.platforms.provisionPrincipal({
        externalId,
        displayName: "Dana",
        role: "editor",
      });

      expect(principal).toEqual({
        externalId,
        userId: "u_1",
        email: "sunny-abc@org.svc.base44.invalid",
        role: "editor",
        created: true,
      });
      expect(scope.isDone()).toBe(true);
    });

    test("omits display name and role rather than sending nulls, so server defaults apply", async () => {
      // `role` in particular is clamped server-side; sending an explicit null
      // would be asking for a role rather than accepting the default.
      scope
        .post("/api/service/users", (body) => {
          expect(body).toEqual({ service_external_id: externalId });
          return true;
        })
        .reply(200, principalBody);

      await base44.platforms.provisionPrincipal({ externalId });
      expect(scope.isDone()).toBe(true);
    });

    test("provisioning presents the PROVISION key, never the mint key", async () => {
      scope
        .post("/api/service/users")
        .matchHeader("Authorization", `Bearer ${provisionKey}`)
        .reply(200, principalBody);

      await base44.platforms.provisionPrincipal({ externalId });
      expect(scope.isDone()).toBe(true);
    });

    test("deprovisionPrincipal escapes the id into the path", async () => {
      // A principal id is caller-supplied. Unescaped, one containing a slash or
      // a query character addresses a different route entirely.
      scope
        .delete(`/api/service/users/${encodeURIComponent("user 42/../admin")}`)
        .reply(200, {
          service_external_id: "user 42/../admin",
          removed: true,
        });

      const result = await base44.platforms.deprovisionPrincipal(
        "user 42/../admin"
      );

      expect(result).toEqual({ externalId: "user 42/../admin", removed: true });
      expect(scope.isDone()).toBe(true);
    });

    test("a repeat deprovision reports removed: false rather than failing", async () => {
      scope
        .delete(`/api/service/users/${externalId}`)
        .reply(200, { service_external_id: externalId, removed: false });

      await expect(
        base44.platforms.deprovisionPrincipal(externalId)
      ).resolves.toEqual({ externalId, removed: false });
    });
  });

  describe("acting as a principal", () => {
    test("getToken mints with the MINT key and returns the access token", async () => {
      scope
        .post("/api/service/user-tokens", { service_external_id: externalId })
        .matchHeader("Authorization", `Bearer ${mintKey}`)
        .reply(200, tokenBody("access-1"));

      const token = await base44.asPrincipal(externalId).getToken();

      expect(token).toBe("access-1");
      expect(scope.isDone()).toBe(true);
    });

    test("a vended token is reused rather than re-minted", async () => {
      // The whole point of the cache: minting is rate-limited per WORKSPACE, so
      // a platform that mints per request spends one shared budget for all of
      // its users at once.
      scope
        .post("/api/service/user-tokens")
        .once()
        .reply(200, tokenBody("access-1"));

      const asDana = base44.asPrincipal(externalId);
      expect(await asDana.getToken()).toBe("access-1");
      expect(await asDana.getToken()).toBe("access-1");
      expect(await asDana.getToken()).toBe("access-1");

      expect(scope.isDone()).toBe(true);
      expect(nock.pendingMocks()).toEqual([]);
    });

    test("concurrent first calls share one mint", async () => {
      // Without single-flight, N requests arriving for a user whose token just
      // lapsed each fire their own mint — a burst against the exact limit the
      // cache exists to respect.
      scope
        .post("/api/service/user-tokens")
        .once()
        .delay(20)
        .reply(200, tokenBody("access-1"));

      const asDana = base44.asPrincipal(externalId);
      const tokens = await Promise.all([
        asDana.getToken(),
        asDana.getToken(),
        asDana.getToken(),
      ]);

      expect(tokens).toEqual(["access-1", "access-1", "access-1"]);
      expect(nock.pendingMocks()).toEqual([]);
    });

    test("asPrincipal returns the same handle, so the cache is not thrown away", async () => {
      expect(base44.asPrincipal(externalId)).toBe(
        base44.asPrincipal(externalId)
      );
      expect(base44.asPrincipal("other")).not.toBe(
        base44.asPrincipal(externalId)
      );
    });

    test("distinct principals get distinct tokens", async () => {
      scope
        .post("/api/service/user-tokens", { service_external_id: "user_1" })
        .reply(200, tokenBody("access-1"));
      scope
        .post("/api/service/user-tokens", { service_external_id: "user_2" })
        .reply(200, tokenBody("access-2"));

      expect(await base44.asPrincipal("user_1").getToken()).toBe("access-1");
      expect(await base44.asPrincipal("user_2").getToken()).toBe("access-2");
      expect(scope.isDone()).toBe(true);
    });

    test("an expired token is renewed with the refresh token, not re-minted", async () => {
      // expires_in below the skew means the token is stale the moment it lands,
      // which is how this exercises renewal without waiting an hour.
      scope
        .post("/api/service/user-tokens")
        .reply(200, { ...tokenBody("access-1"), expires_in: 0 });

      const asDana = base44.asPrincipal(externalId);
      expect(await asDana.getToken()).toBe("access-1");

      scope
        .post("/oauth/token", (body) => {
          const params = new URLSearchParams(body as string);
          expect(params.get("grant_type")).toBe("refresh_token");
          expect(params.get("refresh_token")).toBe("refresh-1");
          expect(params.get("client_id")).toBe("svc_delegate");
          return true;
        })
        .reply(200, tokenBody("access-2", "refresh-2"));

      expect(await asDana.getToken()).toBe("access-2");
      expect(scope.isDone()).toBe(true);
    });

    test("the refresh call carries no workspace key", async () => {
      // /oauth/token authenticates the refresh token, not the caller. Presenting
      // a workspace key there sends a long-lived secret somewhere that neither
      // wants nor checks it.
      scope
        .post("/api/service/user-tokens")
        .reply(200, { ...tokenBody("access-1"), expires_in: 0 });

      const asDana = base44.asPrincipal(externalId);
      await asDana.getToken();

      scope
        .post("/oauth/token")
        .matchHeader("Authorization", (value) => value === undefined)
        .reply(200, tokenBody("access-2"));

      expect(await asDana.getToken()).toBe("access-2");
      expect(scope.isDone()).toBe(true);
    });

    test("a rejected refresh falls back to minting", async () => {
      scope
        .post("/api/service/user-tokens")
        .reply(200, { ...tokenBody("access-1"), expires_in: 0 });

      const asDana = base44.asPrincipal(externalId);
      await asDana.getToken();

      scope.post("/oauth/token").reply(400, { detail: "invalid_grant" });
      scope.post("/api/service/user-tokens").reply(200, tokenBody("access-3"));

      expect(await asDana.getToken()).toBe("access-3");
      expect(scope.isDone()).toBe(true);
    });

    test("a 404 from mint surfaces — it never auto-provisions", async () => {
      // This is what an un-provisioned externalId looks like, and it is load
      // bearing: if mint created principals, deprovisioning would not stick.
      scope.post("/api/service/user-tokens").reply(404, {
        detail: "No service principal matches the provided service_external_id",
        code: "NOT_FOUND",
      });

      await expect(
        base44.asPrincipal("never-provisioned").getToken()
      ).rejects.toMatchObject({ name: "Base44Error", status: 404 });
    });

    test("a failed mint is not cached, so the next call retries", async () => {
      scope.post("/api/service/user-tokens").reply(500, { detail: "boom" });
      scope.post("/api/service/user-tokens").reply(200, tokenBody("access-1"));

      const asDana = base44.asPrincipal(externalId);
      await expect(asDana.getToken()).rejects.toMatchObject({ status: 500 });
      expect(await asDana.getToken()).toBe("access-1");
      expect(scope.isDone()).toBe(true);
    });
  });

  describe("forApp", () => {
    test("returns an app client authenticated as the principal", async () => {
      scope.post("/api/service/user-tokens").reply(200, tokenBody("access-1"));

      const app = await base44.asPrincipal(externalId).forApp("app_1");

      scope
        .get("/api/apps/app_1/entities/Todo")
        .matchHeader("Authorization", "Bearer access-1")
        .matchHeader("X-App-Id", "app_1")
        .reply(200, [{ id: "t1" }]);

      await expect(app.entities.Todo.list()).resolves.toEqual([{ id: "t1" }]);
      expect(scope.isDone()).toBe(true);
    });

    test("the same app returns the same client, carrying a renewed token", async () => {
      scope
        .post("/api/service/user-tokens")
        .reply(200, { ...tokenBody("access-1"), expires_in: 0 });

      const asDana = base44.asPrincipal(externalId);
      const first = await asDana.forApp("app_1");

      scope.post("/oauth/token").reply(200, tokenBody("access-2", "refresh-2"));
      const second = await asDana.forApp("app_1");

      expect(second).toBe(first);

      scope
        .get("/api/apps/app_1/entities/Todo")
        .matchHeader("Authorization", "Bearer access-2")
        .reply(200, []);

      await second.entities.Todo.list();
      expect(scope.isDone()).toBe(true);
    });

    test("an unchanged token is not re-applied to the client", async () => {
      // `setToken` is an identity change: it drops the in-flight `me()` other
      // callers are awaiting and resets the analytics session. `forApp` is
      // documented as cheap to call per request, so it must stay a no-op while
      // the token holds.
      scope.post("/api/service/user-tokens").reply(200, tokenBody("access-1"));

      const asDana = base44.asPrincipal(externalId);
      const client = await asDana.forApp("app_1");

      let applied = 0;
      const realSetToken = client.setToken.bind(client);
      client.setToken = (token: string) => {
        applied++;
        realSetToken(token);
      };

      await asDana.forApp("app_1");
      await asDana.forApp("app_1");

      expect(applied).toBe(0);
    });

    test("different apps get different clients", async () => {
      scope.post("/api/service/user-tokens").reply(200, tokenBody("access-1"));

      const asDana = base44.asPrincipal(externalId);
      const first = await asDana.forApp("app_1");
      const second = await asDana.forApp("app_2");

      // Compared through `Object.is` and the config rather than by passing the
      // clients to a matcher: a failing matcher serializes them, and reading
      // every property means reading `asServiceRole`, which throws by design.
      expect(Object.is(first, second)).toBe(false);
      expect(first.getConfig().appId).toBe("app_1");
      expect(second.getConfig().appId).toBe("app_2");
    });
  });

  describe("revoking", () => {
    test("revokeToken posts the refresh token to /oauth/revoke and forgets it", async () => {
      scope.post("/api/service/user-tokens").reply(200, tokenBody("access-1"));

      const asDana = base44.asPrincipal(externalId);
      await asDana.getToken();

      scope
        .post("/oauth/revoke", (body) => {
          const params = new URLSearchParams(body as string);
          expect(params.get("token")).toBe("refresh-1");
          expect(params.get("client_id")).toBe("svc_delegate");
          return true;
        })
        .reply(200, {});

      await asDana.revokeToken();

      // Forgotten, so the next call mints again rather than reusing.
      scope.post("/api/service/user-tokens").reply(200, tokenBody("access-9"));
      expect(await asDana.getToken()).toBe("access-9");
      expect(scope.isDone()).toBe(true);
    });

    test("a failed revoke still forgets the token locally", async () => {
      // Otherwise a caller cannot forget a principal when Base44 is unreachable,
      // which is exactly when they most want to.
      scope.post("/api/service/user-tokens").reply(200, tokenBody("access-1"));

      const asDana = base44.asPrincipal(externalId);
      await asDana.getToken();

      scope.post("/oauth/revoke").reply(500, { detail: "boom" });
      await expect(asDana.revokeToken()).resolves.toBeUndefined();

      scope.post("/api/service/user-tokens").reply(200, tokenBody("access-9"));
      expect(await asDana.getToken()).toBe("access-9");
    });

    test("revoking without a vended token does not call out", async () => {
      await expect(
        base44.asPrincipal("never-used").revokeToken()
      ).resolves.toBeUndefined();
      expect(nock.isDone()).toBe(true);
    });
  });

  describe("configuration", () => {
    test("provisionKey defaults to mintKey for a single-key deployment", async () => {
      const single = createPlatformClient({ serverUrl, mintKey });

      scope
        .post("/api/service/users")
        .matchHeader("Authorization", `Bearer ${mintKey}`)
        .reply(200, principalBody);

      await single.platforms.provisionPrincipal({ externalId });
      expect(scope.isDone()).toBe(true);
    });
  });
});
