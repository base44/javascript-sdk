import { afterEach, beforeEach, describe, expect, test } from "vitest";
import nock from "nock";
import {
  createClient,
  createClientFromRequest,
  Base44Error,
} from "../../src/index.ts";

describe("Voice module", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const serviceToken = "service-token-123";
  const userToken = "user-token-456";
  const sessionId = "OAlive_123.kX9tQ2mVb7LwR4sZ0aYcEg";
  const offer = "v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\n";
  const answer = "v=0\r\no=- 1802954717 1 IN IP4 0.0.0.0\r\n";
  const required = {
    sdp: offer,
    mcpProfileId: "6a1f0c2b9d8e7f6a5b4c3d2e",
    voiceInstructions: "Speak briefly.",
    agentInstructions: "Use the app tools.",
  };
  const requiredBody = {
    sdp: offer,
    mcp_profile_id: "6a1f0c2b9d8e7f6a5b4c3d2e",
    voice_instructions: "Speak briefly.",
    agent_instructions: "Use the app tools.",
  };
  const created = {
    session_id: sessionId,
    sdp: answer,
    expires_at: "2030-01-01T12:30:00Z",
    environment: "live",
  };
  let base44: ReturnType<typeof createClient>;
  let scope: nock.Scope;

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId, serviceToken });
    scope = nock(serverUrl);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test("startSession posts with the service token and maps the response", async () => {
    scope
      .post("/api/v1/voice-sessions", requiredBody)
      .matchHeader("Authorization", `Bearer ${serviceToken}`)
      .reply(201, created);

    const session = await base44.asServiceRole.voice.startSession(required);

    expect(session).toEqual({
      sessionId,
      sdp: answer,
      expiresAt: "2030-01-01T12:30:00Z",
      environment: "live",
      end: expect.any(Function),
    });
    expect(scope.isDone()).toBe(true);
  });

  test("startSession omits optional keys when not set", async () => {
    let body: Record<string, unknown> = {};
    scope
      .post("/api/v1/voice-sessions", (b) => {
        body = b;
        return true;
      })
      .reply(201, created);

    await base44.asServiceRole.voice.startSession(required);

    expect(body).toEqual(requiredBody);
    expect(scope.isDone()).toBe(true);
  });

  test("startSession forwards models, voice, and initialMessages", async () => {
    const initialMessages = [
      { role: "developer", text: "The person is viewing order 1042." },
      { role: "user", text: "Where is my order?" },
    ];
    scope
      .post("/api/v1/voice-sessions", {
        ...requiredBody,
        voice_model: "gpt_live_1",
        agent_model: "gpt_6_luna",
        voice: "cedar",
        initial_messages: initialMessages,
      })
      .reply(201, created);

    await base44.asServiceRole.voice.startSession({
      ...required,
      voiceModel: "gpt_live_1",
      agentModel: "gpt_6_luna",
      voice: "cedar",
      initialMessages,
    });

    expect(scope.isDone()).toBe(true);
  });

  test("startSession passes values through without checking them", async () => {
    // Base44 owns validation, so the SDK sends values it doesn't recognize.
    const unchecked = {
      ...required,
      mcpProfileId: "not-a-profile-id",
      voiceModel: "some_future_voice_model",
      agentModel: "some_future_agent_model",
      voice: "some-future-voice",
      initialMessages: [{ role: "system", text: "x".repeat(100_000) }],
    };
    scope
      .post("/api/v1/voice-sessions", {
        ...requiredBody,
        mcp_profile_id: "not-a-profile-id",
        voice_model: "some_future_voice_model",
        agent_model: "some_future_agent_model",
        voice: "some-future-voice",
        initial_messages: unchecked.initialMessages,
      })
      .reply(201, created);

    await base44.asServiceRole.voice.startSession(unchecked);

    expect(scope.isDone()).toBe(true);
  });

  test("startSession sends on-behalf-of and Base44-Functions-Version together", async () => {
    const client = createClient({
      serverUrl,
      appId,
      serviceToken,
      token: userToken,
      functionsVersion: "preview",
    });
    scope
      .post("/api/v1/voice-sessions")
      .matchHeader("Authorization", `Bearer ${serviceToken}`)
      .matchHeader("on-behalf-of", `Bearer ${userToken}`)
      .matchHeader("Base44-Functions-Version", "preview")
      .reply(201, { ...created, environment: "draft" });

    const session = await client.asServiceRole.voice.startSession(required);

    expect(session.environment).toBe("draft");
    expect(scope.isDone()).toBe(true);
  });

  test("startSession sends neither header when there is no user or version", async () => {
    scope
      .post("/api/v1/voice-sessions")
      .matchHeader("on-behalf-of", (value) => value === undefined)
      .matchHeader("Base44-Functions-Version", (value) => value === undefined)
      .reply(201, created);

    await base44.asServiceRole.voice.startSession(required);

    expect(scope.isDone()).toBe(true);
  });

  test("a client from a function request forwards the user, version, and state", async () => {
    const request = new Request("https://function.example.com", {
      headers: {
        "Base44-App-Id": appId,
        "Base44-Api-Url": serverUrl,
        Authorization: `Bearer ${userToken}`,
        "Base44-Service-Authorization": `Bearer ${serviceToken}`,
        "Base44-Functions-Version": "branch:abc123",
        "Base44-State": "signed-state",
      },
    });
    const client = createClientFromRequest(request);
    scope
      .post("/api/v1/voice-sessions")
      .matchHeader("Authorization", `Bearer ${serviceToken}`)
      .matchHeader("on-behalf-of", `Bearer ${userToken}`)
      .matchHeader("Base44-Functions-Version", "branch:abc123")
      .matchHeader("Base44-State", "signed-state")
      .reply(201, created);

    await client.asServiceRole.voice.startSession(required);

    expect(scope.isDone()).toBe(true);
  });

  test("the functions version is only added to voice requests", async () => {
    const client = createClient({
      serverUrl,
      appId,
      serviceToken,
      functionsVersion: "preview",
    });
    scope
      .post("/api/v1/browser-sessions")
      .matchHeader("Base44-Functions-Version", (value) => value === undefined)
      .reply(201, {
        session_id: "BBsession.kX9tQ2mVb7LwR4sZ0aYcEg",
        connection_url: "wss://connect.example.com/",
        connection_scope: "browser",
      });

    await client.asServiceRole.browser.getSession();

    expect(scope.isDone()).toBe(true);
  });

  test("startSession surfaces the error code and doesn't retry", async () => {
    scope.post("/api/v1/voice-sessions").once().reply(422, {
      error: {
        code: "unsupported_agent_model",
        message: "Unsupported agent model: gpt_0",
      },
    });

    const error = await base44.asServiceRole.voice
      .startSession({ ...required, agentModel: "gpt_0" })
      .catch((e) => e);

    expect(error).toBeInstanceOf(Base44Error);
    expect(error.status).toBe(422);
    expect(error.code).toBe("unsupported_agent_model");
    expect(scope.isDone()).toBe(true);
  });

  test("endSession deletes the session with the service token", async () => {
    scope
      .delete(`/api/v1/voice-sessions/${sessionId}`)
      .matchHeader("Authorization", `Bearer ${serviceToken}`)
      .reply(204);

    await expect(
      base44.asServiceRole.voice.endSession(sessionId)
    ).resolves.toBeUndefined();
    expect(scope.isDone()).toBe(true);
  });

  test("endSession encodes the session ID in the path", async () => {
    scope.delete("/api/v1/voice-sessions/a%2Fb%3Fc").reply(204);

    await base44.asServiceRole.voice.endSession("a/b?c");
    expect(scope.isDone()).toBe(true);
  });

  test("session.end() ends the session it was returned with", async () => {
    scope
      .post("/api/v1/voice-sessions")
      .reply(201, created)
      .delete(`/api/v1/voice-sessions/${sessionId}`)
      .reply(204);

    const session = await base44.asServiceRole.voice.startSession(required);
    await session.end();

    expect(scope.isDone()).toBe(true);
  });

  test("endSession surfaces voice_session_not_found", async () => {
    scope.delete(`/api/v1/voice-sessions/${sessionId}`).reply(404, {
      error: {
        code: "voice_session_not_found",
        message: "Voice session not found.",
      },
    });

    const error = await base44.asServiceRole.voice
      .endSession(sessionId)
      .catch((e) => e);

    expect(error).toBeInstanceOf(Base44Error);
    expect(error.status).toBe(404);
    expect(error.code).toBe("voice_session_not_found");
  });

  test.each([undefined, "", 123])(
    "endSession rejects %j without sending a request",
    async (invalid) => {
      // Catch-all mock: if any delete request were sent, it would be consumed.
      scope.delete(/^\/api\/v1\/voice-sessions/).reply(204);

      await expect(
        base44.asServiceRole.voice.endSession(invalid as unknown as string)
      ).rejects.toThrow("Session ID is required and must be a string");
      expect(scope.isDone()).toBe(false);
    }
  );

  test("voice is not available without a service token", () => {
    const userClient = createClient({ serverUrl, appId, token: userToken });
    expect(() => userClient.asServiceRole.voice).toThrow(
      /Service token is required/
    );
  });
});
