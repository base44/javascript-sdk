import { afterEach, beforeEach, describe, expect, test } from "vitest";
import nock from "nock";
import { createClient, Base44Error } from "../../src/index.ts";

describe("Browser module", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const serviceToken = "service-token-123";
  const connectionUrl = "wss://connect.example.com/?signingKey=session-credential";
  let base44: ReturnType<typeof createClient>;
  let scope: nock.Scope;

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId, serviceToken });
    scope = nock(serverUrl);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test("getSession posts with the service token and maps the response", async () => {
    scope
      .post("/api/v1/browser-sessions", { capture_debug_artifacts: true })
      .matchHeader("Authorization", `Bearer ${serviceToken}`)
      .reply(201, {
        session_id: "session-1",
        connection_url: connectionUrl,
        connection_scope: "browser",
        connection_expires_at: "2030-01-01T12:00:00Z",
        session_expires_at: "2030-01-01T13:00:00Z",
      });

    const session = await base44.asServiceRole.browser.getSession();

    expect(session).toEqual({
      sessionId: "session-1",
      connectionUrl,
      connectionScope: "browser",
      connectionExpiresAt: "2030-01-01T12:00:00Z",
      sessionExpiresAt: "2030-01-01T13:00:00Z",
    });
    expect(scope.isDone()).toBe(true);
  });

  test("getSession forwards captureDebugArtifacts", async () => {
    scope
      .post("/api/v1/browser-sessions", { capture_debug_artifacts: false })
      .reply(201, {
        session_id: "session-1",
        connection_url: connectionUrl,
        connection_scope: "page",
      });

    const session = await base44.asServiceRole.browser.getSession({
      captureDebugArtifacts: false,
    });

    expect(session).toEqual({
      sessionId: "session-1",
      connectionUrl,
      connectionScope: "page",
    });
    expect(scope.isDone()).toBe(true);
  });

  test("getSession surfaces the error code and doesn't retry", async () => {
    scope.post("/api/v1/browser-sessions").once().reply(429, {
      error: {
        code: "browser_capacity_exceeded",
        message: "Browser capacity is temporarily unavailable.",
      },
    });

    const error = await base44.asServiceRole.browser
      .getSession()
      .catch((e) => e);

    expect(error).toBeInstanceOf(Base44Error);
    expect(error.status).toBe(429);
    expect(error.code).toBe("browser_capacity_exceeded");
    expect(scope.isDone()).toBe(true);
  });

  test("browser is not available without a service token", () => {
    const userClient = createClient({ serverUrl, appId, token: "user-token" });
    expect(() => userClient.asServiceRole.browser).toThrow(
      /Service token is required/
    );
  });
});
