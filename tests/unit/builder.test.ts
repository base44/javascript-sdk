import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import nock from "nock";
import { createBuilderSession, createPlatformClient } from "../../src/index.ts";
import type { BuilderEvent } from "../../src/index.ts";

const serverUrl = "https://base44.app";
const appId = "app_1";
const externalId = "user_42";
const accessToken = "vended-access-token";

/** A stream that stays open until the test closes it, so nothing reconnects mid-assertion. */
function openStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
    push: (chunk: string) => controller.enqueue(encoder.encode(chunk)),
    close: () => controller.close(),
  };
}

function frame(event: string, payload: Record<string, unknown>, seq: string) {
  const data = JSON.stringify({ type: event, seq, ...payload });
  return `id: ${seq}\nevent: ${event}\ndata: ${data}\n\n`;
}

/** Resolves once `count` events have arrived. */
function collector(count: number) {
  const events: BuilderEvent[] = [];
  let settle!: () => void;
  const reached = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return {
    events,
    reached,
    onEvent: (event: BuilderEvent) => {
      events.push(event);
      if (events.length >= count) settle();
    },
  };
}

describe("Builder sessions", () => {
  let base44: ReturnType<typeof createPlatformClient>;
  let scope: nock.Scope;
  let fetches: { url: string; init: RequestInit }[];
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    base44 = createPlatformClient({
      serverUrl,
      mintKey: "b44k_mint_key",
      provisionKey: "b44k_provision_key",
    });
    scope = nock(serverUrl);
    fetches = [];
    // The token every build call rides on. Minting is cached, so one is enough
    // for a whole test.
    scope.post("/api/service/user-tokens").reply(200, {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: null,
    });
  });

  afterEach(() => {
    nock.cleanAll();
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  const builder = () => base44.asPrincipal(externalId).builder(appId);

  /** Serves one response per subscribe attempt, recording what was asked for. */
  function stubStream(...responses: Response[]) {
    let call = 0;
    globalThis.fetch = vi.fn(async (url: unknown, init: unknown) => {
      fetches.push({ url: String(url), init: init as RequestInit });
      const response = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return response;
    }) as unknown as typeof fetch;
  }

  describe("writes", () => {
    test("sendMessage starts a turn and returns its id without waiting for it", async () => {
      scope
        .post(`/api/v1/apps/${appId}/build/messages`, {
          content: "add a footer",
          file_urls: ["https://cdn.example/logo.png"],
        })
        .reply(202, { session_id: appId, turn_id: "turn_1" });

      const turn = await builder().sendMessage("add a footer", {
        fileUrls: ["https://cdn.example/logo.png"],
      });

      expect(turn).toEqual({ sessionId: appId, turnId: "turn_1" });
      expect(scope.isDone()).toBe(true);
    });

    test("an idempotency key rides the header, and is never invented", async () => {
      const sent: (string | undefined)[] = [];
      scope
        .post(`/api/v1/apps/${appId}/build/messages`)
        .twice()
        .reply(202, function () {
          sent.push(this.req.headers["idempotency-key"]);
          return { session_id: appId, turn_id: "turn_1" };
        });

      await builder().sendMessage("hello");
      await builder().sendMessage("hello", { idempotencyKey: "req_7" });

      // A key the SDK generated would differ on the retry and protect nothing,
      // so no key means no header and the server names the turn instead.
      expect(sent).toEqual([undefined, "req_7"]);
    });

    test("every builder call presents the principal's vended token, not a workspace key", async () => {
      let authorization: string | undefined;
      scope.post(`/api/v1/apps/${appId}/build/messages`).reply(202, function () {
        authorization = this.req.headers.authorization;
        return { session_id: appId, turn_id: "turn_1" };
      });

      await builder().sendMessage("hello");
      expect(authorization).toBe(`Bearer ${accessToken}`);
    });

    test("respond sends an approval as a decision", async () => {
      scope
        .post(`/api/v1/apps/${appId}/build/responses`, {
          kind: "approval",
          waitpoint_id: "call_9",
          approved: true,
        })
        .reply(202, { session_id: appId, turn_id: "turn_2" });

      await builder().respond({
        kind: "approval",
        waitpointId: "call_9",
        approved: true,
      });
      expect(scope.isDone()).toBe(true);
    });

    test("respond omits value rather than sending null, because omitting it declines", async () => {
      scope
        .post(`/api/v1/apps/${appId}/build/responses`, (body) => {
          expect(body).toEqual({ kind: "input", waitpoint_id: "call_9" });
          return true;
        })
        .reply(202, { session_id: appId, turn_id: "turn_3" });

      await builder().respond({ kind: "input", waitpointId: "call_9" });
      expect(scope.isDone()).toBe(true);
    });

    test("cancel resolves once the stop has landed", async () => {
      scope
        .post(`/api/v1/apps/${appId}/build/cancel`)
        .reply(200, { session_id: appId, state: "ready" });

      await expect(builder().cancel()).resolves.toBeUndefined();
      expect(scope.isDone()).toBe(true);
    });

    test("createGrant returns an absolute events URL, so it is usable as handed over", async () => {
      scope
        .post(`/api/v1/apps/${appId}/build/grants`, { token_ttl_seconds: 900 })
        .reply(201, {
          session_id: appId,
          grant_id: "g_1",
          token: "grant-token",
          expires_in: 900,
          expires_at: "2026-08-30T12:00:00Z",
          events_url: `/api/v1/apps/${appId}/build/events`,
        });

      const grant = await builder().createGrant({ ttlSeconds: 900 });

      expect(grant).toEqual({
        sessionId: appId,
        grantId: "g_1",
        token: "grant-token",
        expiresIn: 900,
        expiresAt: "2026-08-30T12:00:00Z",
        eventsUrl: `${serverUrl}/api/v1/apps/${appId}/build/events`,
      });
    });

    test("revokeGrant escapes a caller-supplied id into the path", async () => {
      scope
        .delete(`/api/v1/apps/${appId}/build/grants/a%2Fb`)
        .reply(204);

      await builder().revokeGrant("a/b");
      expect(scope.isDone()).toBe(true);
    });
  });

  describe("reads", () => {
    test("getState projects a waitpoint into the public vocabulary", async () => {
      scope.get(`/api/v1/apps/${appId}/build/state`).reply(200, {
        session_id: appId,
        app_id: appId,
        state: {
          status: "waiting",
          turn_id: "turn_1",
          waiting_on: {
            kind: "choice",
            waitpoint_id: "call_9",
            tool_name: "ask_user",
          },
        },
      });

      await expect(builder().getState()).resolves.toEqual({
        status: "waiting",
        turnId: "turn_1",
        waitingOn: {
          kind: "choice",
          waitpointId: "call_9",
          toolName: "ask_user",
        },
      });
    });

    test("out of credits reads as blocked with a reason, not as a waitpoint", async () => {
      scope.get(`/api/v1/apps/${appId}/build/state`).reply(200, {
        session_id: appId,
        state: { status: "blocked", reason: "quota", turn_id: "turn_1" },
      });

      const state = await builder().getState();
      expect(state).toEqual({
        status: "blocked",
        reason: "quota",
        turnId: "turn_1",
      });
      expect(state.waitingOn).toBeUndefined();
    });

    test("listMessages projects tool calls and hands back the cursor", async () => {
      scope
        .get(`/api/v1/apps/${appId}/build/messages`)
        .query({ limit: 2 })
        .reply(200, {
          session_id: appId,
          messages: [
            {
              message_id: "m_1",
              role: "user",
              content: "build me a shop",
              tool_calls: [],
            },
            {
              message_id: "m_2",
              role: "assistant",
              content: "on it",
              tool_calls: [
                {
                  id: "call_9",
                  name: "ask_user",
                  status: "waiting_for_user_input",
                  requires_user_input: true,
                  waiting_on_kind: "choice",
                  arguments: '{"questions":[',
                  display: { title: "Pick one" },
                },
              ],
            },
          ],
          next_after: "cursor-1",
        });

      const page = await builder().listMessages({ limit: 2 });

      expect(page.nextAfter).toBe("cursor-1");
      expect(page.messages[1]).toEqual({
        messageId: "m_2",
        role: "assistant",
        content: "on it",
        toolCalls: [
          {
            id: "call_9",
            name: "ask_user",
            status: "waiting_for_user_input",
            requiresUserInput: true,
            waitingOnKind: "choice",
            // Left as the raw string: mid-generation arguments are routinely
            // incomplete JSON, and parsing here would throw on exactly the ticks
            // a partner needs.
            arguments: '{"questions":[',
            display: { title: "Pick one" },
          },
        ],
      });
    });

    test("getTurn reports whether the turn is still live", async () => {
      scope.get(`/api/v1/apps/${appId}/build/turns/turn_1`).reply(200, {
        session_id: appId,
        turn_id: "turn_1",
        live: false,
        state: { status: "idle", turn_id: "turn_1" },
      });

      await expect(builder().getTurn("turn_1")).resolves.toEqual({
        turnId: "turn_1",
        live: false,
        state: { status: "idle", turnId: "turn_1" },
      });
    });
  });

  describe("streaming", () => {
    test("subscribe delivers typed events and ignores keepalives", async () => {
      const stream = openStream();
      stubStream(stream.response);
      const seen = collector(2);

      const unsubscribe = builder().subscribe(seen.onEvent);
      stream.push(": keepalive\n\n");
      stream.push(
        frame("message.updated", {
          turn_id: "turn_1",
          data: { message_id: "m_1", role: "assistant", content: "hi", tool_calls: [] },
        }, "10")
      );
      stream.push(
        frame("turn.finished", {
          turn_id: "turn_1",
          data: { status: "idle", turn_id: "turn_1" },
        }, "11")
      );
      await seen.reached;
      unsubscribe();

      expect(seen.events).toEqual([
        {
          seq: "10",
          turnId: "turn_1",
          type: "message.updated",
          data: { messageId: "m_1", role: "assistant", content: "hi", toolCalls: [] },
        },
        {
          seq: "11",
          turnId: "turn_1",
          type: "turn.finished",
          data: { status: "idle", turnId: "turn_1" },
        },
      ]);
    });

    test("an unrecognised event type is dropped rather than passed through", async () => {
      const stream = openStream();
      stubStream(stream.response);
      const seen = collector(1);

      const unsubscribe = builder().subscribe(seen.onEvent);
      stream.push(frame("build.teleported", { data: { anything: true } }, "20"));
      stream.push(
        frame("state.changed", { data: { status: "running", turn_id: "turn_1" } }, "21")
      );
      await seen.reached;
      unsubscribe();

      expect(seen.events).toHaveLength(1);
      expect(seen.events[0].type).toBe("state.changed");
    });

    test("a dropped connection resumes from the last event rather than replaying everything", async () => {
      const first = openStream();
      const second = openStream();
      stubStream(first.response, second.response);
      const seen = collector(2);

      const unsubscribe = builder().subscribe(seen.onEvent);
      first.push(
        frame("state.changed", { data: { status: "running", turn_id: "turn_1" } }, "30")
      );
      // The body ends without an error, which is what a drained deploy looks
      // like — a reconnect, not a completion.
      await new Promise((resolve) => setTimeout(resolve, 50));
      first.close();
      second.push(
        frame("turn.finished", { data: { status: "idle", turn_id: "turn_1" } }, "31")
      );
      await seen.reached;
      unsubscribe();

      expect(fetches).toHaveLength(2);
      const resumed = fetches[1].init.headers as Record<string, string>;
      expect(resumed["Last-Event-ID"]).toBe("30");
      expect((fetches[0].init.headers as Record<string, string>)["Last-Event-ID"]).toBeUndefined();
    });

    test("a rejected credential stops the subscription instead of hammering the server", async () => {
      stubStream(
        new Response(JSON.stringify({ detail: "This grant has been revoked" }), {
          status: 403,
        })
      );
      let failure: Error | undefined;

      builder().subscribe(() => {}, { onError: (error) => (failure = error) });
      await vi.waitFor(() => expect(failure).toBeDefined());

      expect(failure).toMatchObject({ status: 403, message: "This grant has been revoked" });
      // One attempt. A 403 fails identically forever.
      expect(fetches).toHaveLength(1);
    });

    test("unsubscribing aborts the request in flight", async () => {
      const stream = openStream();
      stubStream(stream.response);

      const unsubscribe = builder().subscribe(() => {});
      await vi.waitFor(() => expect(fetches).toHaveLength(1));
      const signal = fetches[0].init.signal as AbortSignal;
      expect(signal.aborted).toBe(false);

      unsubscribe();
      unsubscribe(); // idempotent
      expect(signal.aborted).toBe(true);
    });

    test("stream() iterates the same events, and leaving the loop unsubscribes", async () => {
      const stream = openStream();
      stubStream(stream.response);

      const collected: string[] = [];
      const iterating = (async () => {
        for await (const event of builder().stream()) {
          collected.push(event.type);
          if (event.type === "turn.finished") break;
        }
      })();

      await vi.waitFor(() => expect(fetches).toHaveLength(1));
      stream.push(frame("turn.started", { data: { status: "running" } }, "40"));
      stream.push(frame("turn.finished", { data: { status: "idle" } }, "41"));
      await iterating;

      expect(collected).toEqual(["turn.started", "turn.finished"]);
      expect((fetches[0].init.signal as AbortSignal).aborted).toBe(true);
    });
  });

  describe("streamText", () => {
    const snapshot = (content: string, seq: string, messageId = "m_1") =>
      frame(
        "message.updated",
        { data: { message_id: messageId, role: "assistant", content, tool_calls: [] } },
        seq
      );

    test("yields what each snapshot added, not the snapshot", async () => {
      const stream = openStream();
      stubStream(stream.response);

      const chunks: string[] = [];
      const reading = (async () => {
        for await (const text of builder().streamText()) chunks.push(text);
      })();

      await vi.waitFor(() => expect(fetches).toHaveLength(1));
      stream.push(snapshot("Building", "50"));
      stream.push(snapshot("Building the", "51"));
      stream.push(snapshot("Building the footer.", "52"));
      stream.push(frame("turn.finished", { data: { status: "idle" } }, "53"));
      await reading;

      expect(chunks).toEqual(["Building", " the", " footer."]);
      expect(chunks.join("")).toBe("Building the footer.");
    });

    test("a rewritten message starts a new paragraph rather than patching history", async () => {
      const stream = openStream();
      stubStream(stream.response);

      const chunks: string[] = [];
      const reading = (async () => {
        for await (const text of builder().streamText()) chunks.push(text);
      })();

      await vi.waitFor(() => expect(fetches).toHaveLength(1));
      stream.push(snapshot("Adding a footer", "60"));
      // Not an extension: the message was retried, and a chat surface has
      // already printed what came before.
      stream.push(snapshot("Let me try that again.", "61"));
      stream.push(frame("turn.finished", { data: { status: "idle" } }, "62"));
      await reading;

      expect(chunks).toEqual(["Adding a footer", "\n\nLet me try that again."]);
    });

    test("ends when the build runs out of credits, which never sends turn.finished", async () => {
      const stream = openStream();
      stubStream(stream.response);

      const chunks: string[] = [];
      const reading = (async () => {
        for await (const text of builder().streamText()) chunks.push(text);
      })();

      await vi.waitFor(() => expect(fetches).toHaveLength(1));
      stream.push(snapshot("Starting", "70"));
      stream.push(
        frame("state.changed", { data: { status: "blocked", reason: "quota" } }, "71")
      );
      await reading;

      expect(chunks).toEqual(["Starting"]);
    });
  });

  describe("waitForTurn", () => {
    test("resolves on the turn's own finish, ignoring another turn's", async () => {
      const stream = openStream();
      stubStream(stream.response);
      scope
        .get(`/api/v1/apps/${appId}/build/turns/turn_2`)
        .reply(404, { detail: "No such turn in the retained window" });

      const waiting = builder().waitForTurn("turn_2");
      await vi.waitFor(() => expect(fetches).toHaveLength(1));

      stream.push(
        frame("turn.finished", { turn_id: "turn_1", data: { status: "idle", turn_id: "turn_1" } }, "80")
      );
      stream.push(
        frame("turn.finished", { turn_id: "turn_2", data: { status: "idle", turn_id: "turn_2" } }, "81")
      );

      await expect(waiting).resolves.toEqual({ status: "idle", turnId: "turn_2" });
      expect((fetches[0].init.signal as AbortSignal).aborted).toBe(true);
    });

    test("resolves for a turn that already finished before anyone waited on it", async () => {
      const stream = openStream();
      stubStream(stream.response);
      scope.get(`/api/v1/apps/${appId}/build/turns/turn_1`).reply(200, {
        turn_id: "turn_1",
        live: false,
        state: { status: "idle", turn_id: "turn_1" },
      });

      await expect(builder().waitForTurn("turn_1")).resolves.toEqual({
        status: "idle",
        turnId: "turn_1",
      });
    });

    test("resolves on blocked, because a build out of credits is not going to finish", async () => {
      const stream = openStream();
      stubStream(stream.response);
      scope.get(`/api/v1/apps/${appId}/build/turns/turn_1`).reply(200, {
        turn_id: "turn_1",
        live: true,
        state: { status: "running", turn_id: "turn_1" },
      });

      const waiting = builder().waitForTurn("turn_1");
      await vi.waitFor(() => expect(fetches).toHaveLength(1));
      stream.push(
        frame(
          "state.changed",
          { turn_id: "turn_1", data: { status: "blocked", reason: "quota", turn_id: "turn_1" } },
          "90"
        )
      );

      await expect(waiting).resolves.toEqual({
        status: "blocked",
        reason: "quota",
        turnId: "turn_1",
      });
    });
  });

  describe("createBuilderSession — the browser half", () => {
    test("carries the grant, and offers no way to spend credits with it", async () => {
      const stream = openStream();
      stubStream(stream.response);

      const session = createBuilderSession({
        appId,
        serverUrl,
        getToken: () => "grant-token",
      });

      // The asymmetry is the design: a grant reads, and writes go through the
      // partner's own server. There is nothing here to call.
      expect("sendMessage" in session).toBe(false);
      expect("createGrant" in session).toBe(false);
      expect("cancel" in session).toBe(false);

      const unsubscribe = session.subscribe(() => {});
      await vi.waitFor(() => expect(fetches).toHaveLength(1));
      unsubscribe();

      const headers = fetches[0].init.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer grant-token");
      expect(fetches[0].url).toBe(`${serverUrl}/api/v1/apps/${appId}/build/events`);
    });

    test("re-reads the grant on every reconnect, so a build outliving one just works", async () => {
      const first = openStream();
      const second = openStream();
      stubStream(first.response, second.response);
      const grants = ["grant-1", "grant-2"];

      const session = createBuilderSession({
        appId,
        serverUrl,
        getToken: () => grants.shift() ?? "grant-2",
      });

      const unsubscribe = session.subscribe(() => {});
      await vi.waitFor(() => expect(fetches).toHaveLength(1));
      first.close();
      await vi.waitFor(() => expect(fetches).toHaveLength(2), { timeout: 5_000 });
      unsubscribe();

      expect((fetches[0].init.headers as Record<string, string>).Authorization).toBe(
        "Bearer grant-1"
      );
      expect((fetches[1].init.headers as Record<string, string>).Authorization).toBe(
        "Bearer grant-2"
      );
    });
  });
});
