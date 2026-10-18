import { afterEach, beforeEach, describe, expect, test } from "vitest";
import nock from "nock";
import { createClient, Base44Error } from "../../src/index.ts";

describe("Browser module", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const serviceToken = "service-token-123";
  const connectionUrl = "wss://connect.example.com/?signingKey=session-credential";
  const sessionId =
    "BB1909cef7-23e8-4394-bc31-27404bf4348f.kX9tQ2mVb7LwR4sZ0aYcEg";
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
        session_id: sessionId,
        connection_url: connectionUrl,
        connection_scope: "browser",
        connection_expires_at: "2030-01-01T12:00:00Z",
        session_expires_at: "2030-01-01T13:00:00Z",
      });

    const session = await base44.asServiceRole.browser.getSession();

    expect(session).toEqual({
      sessionId,
      connectionUrl,
      connectionScope: "browser",
      connectionExpiresAt: "2030-01-01T12:00:00Z",
      sessionExpiresAt: "2030-01-01T13:00:00Z",
      end: expect.any(Function),
    });
    expect(scope.isDone()).toBe(true);
  });

  test("getSession forwards captureDebugArtifacts", async () => {
    scope
      .post("/api/v1/browser-sessions", { capture_debug_artifacts: false })
      .reply(201, {
        session_id: sessionId,
        connection_url: connectionUrl,
        connection_scope: "page",
      });

    const session = await base44.asServiceRole.browser.getSession({
      captureDebugArtifacts: false,
    });

    expect(session).toEqual({
      sessionId,
      connectionUrl,
      connectionScope: "page",
      end: expect.any(Function),
    });
    expect(scope.isDone()).toBe(true);
  });

  test("getSession forwards sessionTimeoutSeconds", async () => {
    scope
      .post("/api/v1/browser-sessions", {
        capture_debug_artifacts: true,
        session_timeout_seconds: 600,
      })
      .reply(201, {
        session_id: sessionId,
        connection_url: connectionUrl,
        connection_scope: "browser",
      });

    await base44.asServiceRole.browser.getSession({
      sessionTimeoutSeconds: 600,
    });

    expect(scope.isDone()).toBe(true);
  });

  test("getSession omits session_timeout_seconds when not set", async () => {
    let body: Record<string, unknown> = {};
    scope
      .post("/api/v1/browser-sessions", (b) => {
        body = b;
        return true;
      })
      .reply(201, {
        session_id: sessionId,
        connection_url: connectionUrl,
        connection_scope: "browser",
      });

    await base44.asServiceRole.browser.getSession({
      captureDebugArtifacts: false,
    });

    expect(body).toEqual({ capture_debug_artifacts: false });
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

  test("endSession deletes the session with the service token", async () => {
    scope
      .delete(`/api/v1/browser-sessions/${sessionId}`)
      .matchHeader("Authorization", `Bearer ${serviceToken}`)
      .reply(204);

    await expect(
      base44.asServiceRole.browser.endSession(sessionId)
    ).resolves.toBeUndefined();
    expect(scope.isDone()).toBe(true);
  });

  test("endSession encodes the session ID in the path", async () => {
    scope.delete("/api/v1/browser-sessions/a%2Fb%3Fc").reply(204);

    await base44.asServiceRole.browser.endSession("a/b?c");
    expect(scope.isDone()).toBe(true);
  });

  test("session.end() ends the session it was returned with", async () => {
    scope
      .post("/api/v1/browser-sessions")
      .reply(201, {
        session_id: sessionId,
        connection_url: connectionUrl,
        connection_scope: "browser",
      })
      .delete(`/api/v1/browser-sessions/${sessionId}`)
      .reply(204);

    const session = await base44.asServiceRole.browser.getSession();
    await session.end();

    expect(scope.isDone()).toBe(true);
  });

  test("endSession surfaces browser_session_not_found", async () => {
    scope.delete(`/api/v1/browser-sessions/${sessionId}`).reply(404, {
      error: {
        code: "browser_session_not_found",
        message: "Browser session not found.",
      },
    });

    const error = await base44.asServiceRole.browser
      .endSession(sessionId)
      .catch((e) => e);

    expect(error).toBeInstanceOf(Base44Error);
    expect(error.status).toBe(404);
    expect(error.code).toBe("browser_session_not_found");
  });

  test.each([undefined, "", 123])(
    "endSession rejects %j without sending a request",
    async (invalid) => {
      await expect(
        base44.asServiceRole.browser.endSession(invalid as unknown as string)
      ).rejects.toThrow("Session ID is required and must be a string");
      expect(nock.pendingMocks()).toEqual([]);
    }
  );

  test("browser is not available without a service token", () => {
    const userClient = createClient({ serverUrl, appId, token: "user-token" });
    expect(() => userClient.asServiceRole.browser).toThrow(
      /Service token is required/
    );
  });
});
