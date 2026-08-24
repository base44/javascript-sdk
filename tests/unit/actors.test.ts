import nock from "nock";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the reconnecting WebSocket with a controllable fake so we can resolve
// async URLs and drive open/message/reconnect behavior without a real socket.
// vi.hoisted so the class/registry exist before the hoisted vi.mock factory runs.
const { sockets, FakeSocket, post, getAnalyticsSessionId } = vi.hoisted(() => {
  class FakeSocket {
    readonly OPEN = 1;
    sent: string[] = [];
    closed = false;
    readyState = 3;
    urls: Promise<string>[] = [];
    private handlers: Record<string, ((ev: any) => void)[]> = {};
    constructor(
      private readonly urlProvider: () => string | Promise<string>,
      _protocols?: unknown,
      options?: { startClosed?: boolean },
    ) {
      sockets.push(this);
      if (!options?.startClosed) this.openNext();
    }
    private openNext() {
      this.closed = false;
      this.readyState = 0;
      this.urls.push(Promise.resolve(this.urlProvider()));
    }
    addEventListener(type: string, fn: (ev: any) => void) {
      (this.handlers[type] ??= []).push(fn);
    }
    send(data: string) { this.sent.push(data); }
    close() {
      this.closed = true;
      this.readyState = 3;
    }
    reconnect() { this.openNext(); }
    emit(type: string, ev: any) {
      if (type === "open") this.readyState = this.OPEN;
      if (type === "close") this.readyState = 3;
      (this.handlers[type] ?? []).forEach((h) => h(ev));
    }
    message(obj: unknown) { this.emit("message", { data: JSON.stringify(obj) }); }
  }
  const sockets: InstanceType<typeof FakeSocket>[] = [];
  const post = vi.fn();
  const getAnalyticsSessionId = vi.fn(() => "anonymoussessionid");
  return { sockets, FakeSocket, post, getAnalyticsSessionId };
});

vi.mock("partysocket", async () => ({
  ...(await vi.importActual<typeof import("partysocket")>("partysocket")),
  WebSocket: FakeSocket,
}));

vi.mock("../../src/modules/analytics.ts", async () => ({
  ...(await vi.importActual<typeof import("../../src/modules/analytics.ts")>(
    "../../src/modules/analytics.ts"
  )),
  getAnalyticsSessionId,
}));

import { createActorsModule, resolveActorsHost } from "../../src/modules/actors.ts";
import { ActorConnectionError, createClient } from "../../src/index.ts";

describe("Actors Module — connection API", () => {
  const config = {
    appId: "app-1",
    connectionClient: { post } as any,
    getAuthToken: () => "user-tok",
    onError: undefined as ((error: Error) => void) | undefined,
    functionsVersion: undefined as string | undefined,
    host: "https://app.example",
  };

  // The module (Proxy of actor names). closeAll is separate — see its own tests.
  const mod = (overrides: Partial<typeof config> = {}) =>
    createActorsModule({ ...config, ...overrides }).module;

  beforeEach(() => {
    sockets.length = 0;
    post.mockReset();
    getAnalyticsSessionId.mockClear();
    post.mockResolvedValue({ status: 409, data: {} });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test("connect() probes Apper and uses the legacy proxy only for 409", async () => {
    const conn = mod().GameRoom("room-1").connect({ id: "conn-1" });

    expect(sockets).toHaveLength(1);
    expect(conn.id).toBe("conn-1");
    const url = new URL(await sockets[0].urls[0]);
    expect(url.origin).toBe("wss://app.example");
    expect(url.pathname).toBe("/parties/GameRoom/room-1");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      _pk: "conn-1",
      app_id: config.appId,
      handler: "GameRoom",
      token: "user-tok",
    });
    expect(post).toHaveBeenCalledWith(
      `/apps/${config.appId}/actors/GameRoom/connection-token`,
      { room: "room-1", connection_id: "conn-1" },
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer user-tok" }),
      }),
    );
  });

  test("a direct response uses the opaque dispatcher URL and short-lived token", async () => {
    post.mockResolvedValue({
      status: 200,
      data: {
        websocket_url:
          "wss://actors.example/v1/actors/actor-p-0123456789abcdef01234567-aaaaaaaaaaaaaaaaaaaaaaaaaa/rooms/room-1?_pk=wrong-id",
        token: "actor-token",
        expires_at: "2026-08-23T12:00:00Z",
        mode: "prod",
      },
    });

    mod().GameRoom("room-1").connect({ id: "conn-1" });
    const url = new URL(await sockets[0].urls[0]);

    expect(url.origin).toBe("wss://actors.example");
    expect(url.searchParams.get("_pk")).toBe("conn-1");
    expect(url.searchParams.get("token")).toBe("actor-token");
    expect(url.toString()).not.toContain("user-tok");
  });

  test.each([null, undefined])(
    "an empty direct response reports the intended validation error for %s data",
    async (data) => {
      const onError = vi.fn();
      post.mockResolvedValue({ status: 204, data });
      mod({ onError }).GameRoom("r").connect({ id: "c1" });

      await expect(sockets[0].urls[0]).rejects.toThrow(
        "Invalid Actor connection response",
      );
      expect(onError).toHaveBeenCalledOnce();
      const reportedError = onError.mock.calls[0][0];
      expect(reportedError).toBeInstanceOf(ActorConnectionError);
      expect(reportedError).toMatchObject({
        actorName: "GameRoom",
        instanceId: "r",
        connectionId: "c1",
      });
      expect(reportedError.cause).toEqual(
        new Error("Invalid Actor connection response"),
      );
      expect(sockets[0].closed).toBe(true);
    },
  );

  test("every reconnect probes again and picks up current auth", async () => {
    let authToken = "first-user-token";
    post
      .mockResolvedValueOnce({
        status: 200,
        data: {
          websocket_url: "wss://actors.example/v1/actors/actor-p-id/rooms/r?_pk=c1",
          token: "first-actor-token",
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          websocket_url: "wss://actors.example/v1/actors/actor-p-id/rooms/r?_pk=c1",
          token: "second-actor-token",
        },
      });

    mod({ getAuthToken: () => authToken }).GameRoom("r").connect({ id: "c1" });
    expect(new URL(await sockets[0].urls[0]).searchParams.get("token")).toBe(
      "first-actor-token",
    );

    authToken = "second-user-token";
    sockets[0].reconnect();
    expect(new URL(await sockets[0].urls[1]).searchParams.get("token")).toBe(
      "second-actor-token",
    );
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][2].headers.Authorization).toBe(
      "Bearer second-user-token",
    );
  });

  test("legacy routing is not cached between reconnects", async () => {
    mod().GameRoom("r").connect({ id: "c1" });
    await sockets[0].urls[0];
    sockets[0].reconnect();
    await sockets[0].urls[1];

    expect(post).toHaveBeenCalledTimes(2);
  });

  test.each([400, 403, 404, 422])(
    "permanent status %s is reported once and releases the connection",
    async (status) => {
      const error = Object.assign(new Error(`Request failed with status code ${status}`), {
        isAxiosError: true,
        response: { status },
      });
      const onError = vi.fn();
      const connectionOnError = vi.fn();
      post.mockRejectedValueOnce(error).mockResolvedValue({ status: 409, data: {} });
      const ref = mod({ onError }).GameRoom("r");
      const conn = ref.connect({ id: "c1", onError: connectionOnError });

      await expect(sockets[0].urls[0]).rejects.toThrow(`status code ${status}`);
      expect(onError).toHaveBeenCalledOnce();
      const reportedError = onError.mock.calls[0][0];
      expect(reportedError).toBeInstanceOf(ActorConnectionError);
      expect(reportedError).toMatchObject({
        actorName: "GameRoom",
        instanceId: "r",
        connectionId: "c1",
        status,
        cause: error,
      });
      expect(connectionOnError).toHaveBeenCalledOnce();
      expect(connectionOnError).toHaveBeenCalledWith(reportedError);
      expect(conn.closed).toBe(true);
      expect(sockets[0].closed).toBe(true);
      expect(sockets[0].urls).toHaveLength(1);
      expect(() => conn.send({ type: "after-close" })).toThrow(reportedError);
      expect(() => conn.subscribe(() => {})).toThrow(reportedError);
      expect(sockets[0].sent).toHaveLength(0);
      const requestOptions = post.mock.calls[0][2];
      expect(requestOptions.validateStatus(409)).toBe(true);
      expect(requestOptions.validateStatus(status)).toBe(false);
      expect(requestOptions.validateStatus(503)).toBe(false);

      ref.connect({ id: "c2" });
      expect(sockets).toHaveLength(2);
      await expect(sockets[1].urls[0]).resolves.toContain("/parties/GameRoom/r");
    },
  );

  test.each([408, 425, 429, 503])(
    "status %s remains retryable under PartySocket backoff",
    async (status) => {
      const error = Object.assign(new Error(`Request failed with status code ${status}`), {
        isAxiosError: true,
        response: { status },
      });
      const onError = vi.fn();
      post.mockRejectedValue(error);
      mod({ onError }).GameRoom("r").connect({ id: "c1" });

      await expect(sockets[0].urls[0]).rejects.toThrow(`status code ${status}`);
      expect(sockets[0].closed).toBe(false);
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0]).toMatchObject({ status, cause: error });
    },
  );

  test("a 401 retries with refreshed auth instead of closing the connection", async () => {
    let authToken = "expired-token";
    const error = Object.assign(new Error("Request failed with status code 401"), {
      isAxiosError: true,
      response: { status: 401 },
    });
    const connectionOnError = vi.fn();
    post
      .mockRejectedValueOnce(error)
      .mockResolvedValue({
        status: 200,
        data: {
          websocket_url: "wss://actors.example/v1/actors/actor-p-id/rooms/r",
          token: "actor-token",
        },
      });
    const conn = mod({ getAuthToken: () => authToken })
      .GameRoom("r")
      .connect({ id: "c1", onError: connectionOnError });

    await expect(sockets[0].urls[0]).rejects.toThrow("status code 401");
    expect(conn.closed).toBe(false);
    expect(connectionOnError.mock.calls[0][0]).toMatchObject({
      actorName: "GameRoom",
      instanceId: "r",
      connectionId: "c1",
      status: 401,
      cause: error,
    });

    authToken = "refreshed-token";
    sockets[0].reconnect();
    await expect(sockets[0].urls[1]).resolves.toContain("token=actor-token");
    expect(post.mock.calls[1][2].headers.Authorization).toBe("Bearer refreshed-token");
  });

  test("network failures remain retryable under PartySocket backoff", async () => {
    const onError = vi.fn();
    const error = Object.assign(new Error("Network Error"), {
      isAxiosError: true,
    });
    post.mockRejectedValue(error);
    mod({ onError }).GameRoom("r").connect({ id: "c1" });

    await expect(sockets[0].urls[0]).rejects.toThrow("Network Error");
    expect(sockets[0].closed).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toMatchObject({ cause: error });
  });

  // conn.reject() picks a code in the app-defined range, and the actor's verdict
  // will not differ next attempt, so one rejection is enough to give up.
  test.each([3000, 3001, 4003, 4999])(
    "actor rejection code %s is reported and terminates the connection",
    async (code) => {
      const onError = vi.fn();
      const connectionOnError = vi.fn();
      const conn = mod({ onError })
        .GameRoom("r")
        .connect({ id: "c1", onError: connectionOnError });
      await sockets[0].urls[0];

      sockets[0].emit("open", {});
      sockets[0].emit("close", { code, reason: "connection rejected" });
      await Promise.resolve();

      expect(conn.closed).toBe(true);
      expect(sockets[0].closed).toBe(true);
      expect(connectionOnError).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith(connectionOnError.mock.calls[0][0]);
      expect(connectionOnError.mock.calls[0][0]).toMatchObject({
        actorName: "GameRoom",
        instanceId: "r",
        connectionId: "c1",
        closeCode: code,
        closeReason: "connection rejected",
      });

      sockets[0].reconnect();
      await expect(sockets[0].urls[1]).rejects.toMatchObject({ closeCode: code });
      expect(post).toHaveBeenCalledOnce();
    },
  );

  // Transport-generated codes, plus 1000 — which a graceful worker shutdown and
  // a rolling deploy both send, so a single one must not be fatal.
  test.each([1000, 1001, 1006, 1008, 1011, 1012])(
    "remote close code %s is reported without terminating the connection",
    async (code) => {
      const onError = vi.fn();
      const conn = mod({ onError }).GameRoom("r").connect({ id: "c1" });
      await sockets[0].urls[0];

      sockets[0].emit("open", {});
      sockets[0].emit("close", { code, reason: "connection closed" });
      await Promise.resolve();

      expect(conn.closed).toBe(false);
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0]).toMatchObject({
        closeCode: code,
        closeReason: "connection closed",
      });
    },
  );

  test("a repeated clean close that never stabilizes exhausts the attempt budget", async () => {
    const onError = vi.fn();
    const conn = mod({ onError }).GameRoom("r").connect({ id: "c1" });
    await sockets[0].urls[0];

    // reject(1000, ...) looks exactly like a graceful shutdown, so only the
    // repetition distinguishes them.
    for (let attempt = 0; attempt < 6; attempt++) {
      expect(conn.closed).toBe(false);
      sockets[0].emit("open", {});
      sockets[0].emit("close", { code: 1000, reason: "" });
      await Promise.resolve();
      if (!conn.closed) sockets[0].reconnect();
    }

    expect(conn.closed).toBe(true);
    expect(onError).toHaveBeenCalledTimes(6);
    expect(onError.mock.calls[5][0]).toMatchObject({ closeCode: 1000 });
  });

  test("a refused upgrade carrying no close code exhausts the attempt budget", async () => {
    // The dispatcher refuses over HTTP (bad token, unknown or throwing Actor),
    // so the socket never opens and the browser reports an opaque error. The
    // close listener skips it, which leaves the budget as the only bound.
    const onError = vi.fn();
    const conn = mod({ onError }).GameRoom("r").connect({ id: "c1" });
    await sockets[0].urls[0];

    for (let attempt = 0; attempt < 6; attempt++) {
      expect(conn.closed).toBe(false);
      sockets[0].emit("error", { message: "" });
      sockets[0].emit("close", { code: 1006, reason: "" });
      await Promise.resolve();
      if (!conn.closed) sockets[0].reconnect();
    }

    expect(conn.closed).toBe(true);
    expect(onError).toHaveBeenCalledTimes(6);
    expect(onError.mock.calls[5][0].cause).toBeInstanceOf(Error);
  });

  test("a socket that stays up resets the budget, so flaky links never terminate", async () => {
    vi.useFakeTimers();
    try {
      const onError = vi.fn();
      const conn = mod({ onError }).GameRoom("r").connect({ id: "c1" });
      await vi.advanceTimersByTimeAsync(1);

      // Twice the budget, but each socket holds past STABLE_MS before dropping.
      for (let attempt = 0; attempt < 12; attempt++) {
        sockets[0].emit("open", {});
        // Answer the heartbeat while we wait, so the only reports come from the
        // drop below rather than from the watchdog.
        for (let tick = 0; tick < 6; tick++) {
          await vi.advanceTimersByTimeAsync(1_000);
          sockets[0].message({ type: "__pong" });
        }
        sockets[0].emit("close", { code: 1006, reason: "" });
        await Promise.resolve();
        expect(conn.closed).toBe(false);
        sockets[0].reconnect();
      }

      expect(conn.closed).toBe(false);
      expect(onError).toHaveBeenCalledTimes(12);
    } finally {
      vi.useRealTimers();
    }
  });

  test("heartbeat reconnects never charge the budget (legacy actors with no __pong)", async () => {
    vi.useFakeTimers();
    try {
      const onError = vi.fn();
      const conn = mod({ onError }).GameRoom("r").connect({ id: "c1" });
      await vi.advanceTimersByTimeAsync(1);
      sockets[0].emit("open", {});

      // An actor that never echoes __pong keeps the watchdog cycling by design;
      // charging the budget for those cycles would kill every such actor.
      for (let cycle = 0; cycle < 12; cycle++) {
        await vi.advanceTimersByTimeAsync(4_000);
        expect(conn.closed).toBe(false);
        sockets[0].emit("open", {});
      }

      expect(conn.closed).toBe(false);
      // The whole silent stretch is one outage: one report, not one per cycle.
      expect(onError).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  test("a silent link reports one outage and widens its reconnect window", async () => {
    vi.useFakeTimers();
    try {
      const onError = vi.fn();
      const conn = mod({ onError }).GameRoom("r").connect({ id: "c1" });
      await vi.advanceTimersByTimeAsync(1);
      const ws = sockets[0];
      const reconnect = vi.spyOn(ws, "reconnect");

      ws.emit("open", {});
      await vi.advanceTimersByTimeAsync(4_000);
      expect(reconnect).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0].cause).toEqual(
        new Error("Actor WebSocket stopped responding"),
      );

      // Reopened but still silent: the dead window doubles and the outage is
      // not re-reported — otherwise a permanently silent link costs one
      // connection-token POST and one app-visible error per DEAD_MS, forever.
      ws.emit("open", {});
      await vi.advanceTimersByTimeAsync(4_000);
      expect(reconnect).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(3_000);
      expect(reconnect).toHaveBeenCalledTimes(2);
      expect(onError).toHaveBeenCalledOnce();

      // An inbound frame ends the outage: the window and report latch reset.
      ws.emit("open", {});
      ws.message({ type: "__pong" });
      await vi.advanceTimersByTimeAsync(4_000);
      expect(reconnect).toHaveBeenCalledTimes(3);
      expect(onError).toHaveBeenCalledTimes(2);

      conn.close();
    } finally {
      vi.useRealTimers();
    }
  });

  test("a WebSocket error after bootstrap is reported with connection context", async () => {
    const onError = vi.fn();
    const cause = new Error("socket failed");
    const conn = mod({ onError }).GameRoom("r").connect({ id: "c1" });
    await sockets[0].urls[0];

    sockets[0].emit("error", { error: cause, message: cause.message });

    expect(conn.closed).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toMatchObject({
      actorName: "GameRoom",
      instanceId: "r",
      connectionId: "c1",
      cause,
    });
  });

  test("an error listener can unsubscribe without closing the connection", async () => {
    const onError = vi.fn();
    const cause = new Error("socket failed");
    const conn = mod().GameRoom("r").connect({ id: "c1" });
    await sockets[0].urls[0];
    const subscription = conn.addErrorListener(onError);

    subscription.unsubscribe();
    sockets[0].emit("error", { error: cause, message: cause.message });

    expect(onError).not.toHaveBeenCalled();
    expect(conn.closed).toBe(false);
  });

  test("PartySocket's synthetic close is replaced by its following error", async () => {
    const onError = vi.fn();
    const cause = new Error("socket failed");
    const conn = mod({ onError }).GameRoom("r").connect({ id: "c1" });
    await sockets[0].urls[0];

    sockets[0].emit("open", {});
    sockets[0].emit("close", { code: 1000, reason: "" });
    sockets[0].emit("error", { error: cause, message: cause.message });
    await Promise.resolve();

    expect(conn.closed).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toMatchObject({
      cause,
      closeCode: undefined,
    });
  });

  test("a throwing connection error handler cannot replace the connection error", async () => {
    const sourceError = Object.assign(new Error("Service unavailable"), {
      isAxiosError: true,
      response: { status: 503 },
    });
    const handlerError = new Error("handler failed");
    const connectionOnError = vi.fn(() => { throw handlerError; });
    const globalOnError = vi.fn();
    post.mockRejectedValue(sourceError);

    mod({ onError: globalOnError })
      .GameRoom("r")
      .connect({ id: "c1", onError: connectionOnError });

    await expect(sockets[0].urls[0]).rejects.toMatchObject({
      cause: sourceError,
      status: 503,
    });
    expect(connectionOnError).toHaveBeenCalledOnce();
    expect(globalOnError).toHaveBeenCalledOnce();
    expect(globalOnError.mock.calls[0][0]).toMatchObject({ cause: sourceError });
  });

  test("anonymous bootstrap uses one stable client correlation id", async () => {
    const actors = mod({ getAuthToken: () => null });
    expect(getAnalyticsSessionId).not.toHaveBeenCalled();

    actors.GameRoom("r").connect({ id: "c1" });
    await sockets[0].urls[0];
    expect(getAnalyticsSessionId).toHaveBeenCalledOnce();
    sockets[0].reconnect();
    await sockets[0].urls[1];

    const firstHeaders = post.mock.calls[0][2].headers;
    const secondHeaders = post.mock.calls[1][2].headers;
    expect(firstHeaders.Authorization).toBeNull();
    expect(firstHeaders["X-Base44-Anonymous-Id"]).toMatch(/^[a-z0-9]+$/);
    expect(secondHeaders["X-Base44-Anonymous-Id"]).toBe(
      firstHeaders["X-Base44-Anonymous-Id"],
    );
    expect(getAnalyticsSessionId).toHaveBeenCalledOnce();
  });

  test("createClient forwards Actor bootstrap errors without allocating an authenticated anonymous id", async () => {
    const serverUrl = "https://actors-sdk.example";
    const onError = vi.fn();
    nock(serverUrl)
      .post("/api/apps/app-1/actors/GameRoom/connection-token")
      .reply(401, { message: "Unauthorized" });
    const client = createClient({
      serverUrl,
      appId: "app-1",
      token: "user-tok",
      options: { onError },
    });
    expect(getAnalyticsSessionId).not.toHaveBeenCalled();

    client.actors.GameRoom("r").connect({ id: "c1" });
    await expect(sockets[0].urls[0]).rejects.toThrow("status code 401");

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toMatchObject({
      actorName: "GameRoom",
      instanceId: "r",
      connectionId: "c1",
      status: 401,
    });
    expect(getAnalyticsSessionId).not.toHaveBeenCalled();
    client.cleanup();
  });

  test("functionsVersion uses the direct header and legacy fv query", async () => {
    mod({ functionsVersion: "draft" }).GameRoom("r").connect({ id: "c1" });
    const url = new URL(await sockets[0].urls[0]);

    expect(post.mock.calls[0][2].headers["Base44-Functions-Version"]).toBe(
      "draft",
    );
    expect(url.searchParams.get("fv")).toBe("draft");
  });

  test("connect() is idempotent per handle", () => {
    const ref = mod().GameRoom("r");
    const a = ref.connect();
    const b = ref.connect();
    expect(sockets).toHaveLength(1);
    expect(a).toBe(b);
  });

  test("repeated connect() rejects an onError it could never detach", async () => {
    const sourceError = Object.assign(new Error("Service unavailable"), {
      isAxiosError: true,
      response: { status: 503 },
    });
    const firstOnError = vi.fn();
    const secondOnError = vi.fn();
    post.mockRejectedValue(sourceError);
    const ref = mod().GameRoom("r");

    const first = ref.connect({ id: "c1", onError: firstOnError });
    expect(() => ref.connect({ id: "c1", onError: secondOnError })).toThrow(
      "use connection.addErrorListener()",
    );
    // Without a handler the call is still the documented no-op reuse.
    expect(ref.connect({ id: "c1" })).toBe(first);

    // The detachable API is how a second observer attaches, and it can leave.
    const subscription = first.addErrorListener(secondOnError);
    await expect(sockets[0].urls[0]).rejects.toThrow("Service unavailable");

    expect(firstOnError).toHaveBeenCalledOnce();
    expect(secondOnError).toHaveBeenCalledOnce();
    expect(secondOnError).toHaveBeenCalledWith(firstOnError.mock.calls[0][0]);

    subscription.unsubscribe();
    sockets[0].reconnect();
    await expect(sockets[0].urls[1]).rejects.toThrow("Service unavailable");
    expect(firstOnError).toHaveBeenCalledTimes(2);
    expect(secondOnError).toHaveBeenCalledOnce();
  });

  test.each([
    ["contains a slash", "team/general"],
    ["is empty", ""],
    ["exceeds 256 characters", "r".repeat(257)],
    ["contains a control character", "room\n1"],
  ])("an instance id that %s is rejected before any request", (_label, instanceId) => {
    // Mirrors the dispatcher's ROOM_RE: it would refuse the upgrade with an
    // HTTP error the browser reports as an opaque 1006, so fail fast instead.
    expect(() => mod().GameRoom(instanceId)).toThrow("Actor instance id");
    expect(sockets).toHaveLength(0);
    expect(post).not.toHaveBeenCalled();
  });

  test.each([
    ["a 256-character id", "r".repeat(256)],
    ["spaces and dots", "match 1.2"],
    ["a tilde at the top of the range", "room~"],
  ])("an instance id with %s is accepted", (_label, instanceId) => {
    expect(() => mod().GameRoom(instanceId).connect({ id: "c1" })).not.toThrow();
    expect(sockets).toHaveLength(1);
  });

  test("repeated connect() rejects a conflicting explicit id", () => {
    const ref = mod().GameRoom("r");
    ref.connect({ id: "c1" });

    expect(() => ref.connect({ id: "c2" })).toThrow(
      'Actor connection is already open with id "c1"; cannot reuse it with id "c2"',
    );
    expect(sockets).toHaveLength(1);
  });

  test("explicit connection ids must satisfy the backend contract", () => {
    expect(() => mod().GameRoom("r").connect({ id: "bad id" })).toThrow(
      "Actor connection id must be 1-64 letters, numbers, underscores, or hyphens",
    );
    expect(sockets).toHaveLength(0);
    expect(post).not.toHaveBeenCalled();
  });

  test("omitted connection ids are generated independently", () => {
    const actors = mod();
    const first = actors.GameRoom("r").connect();
    const second = actors.GameRoom("r").connect();

    expect(first.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(second.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(first.id).not.toBe(second.id);
  });

  test("connection ids remain unique without crypto.randomUUID", () => {
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", undefined);
    try {
      const actors = mod();
      const first = actors.GameRoom("r").connect();
      const second = actors.GameRoom("r").connect();

      expect(first.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      expect(second.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      expect(first.id).not.toBe(second.id);
    } finally {
      vi.stubGlobal("crypto", originalCrypto);
    }
  });

  test("multiple listeners all receive; unsubscribe removes only its own", () => {
    const conn = mod().GameRoom("r").connect();
    const a: unknown[] = [], b: unknown[] = [];
    const subA = conn.subscribe((m) => a.push(m));
    conn.subscribe((m) => b.push(m));

    sockets[0].message({ type: "tick", n: 1 });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);

    subA.unsubscribe();
    sockets[0].message({ type: "tick", n: 2 });
    expect(a).toHaveLength(1); // stopped
    expect(b).toHaveLength(2); // still live
    expect(sockets[0].closed).toBe(false); // socket stays open
  });

  test("__pong platform messages are swallowed", () => {
    const conn = mod().GameRoom("r").connect();
    const got: unknown[] = [];
    conn.subscribe((m) => got.push(m));
    sockets[0].message({ type: "__pong" });
    sockets[0].message({ type: "tick" });
    expect(got).toEqual([{ type: "tick" }]);
  });

  test("send serializes onto the socket", () => {
    const conn = mod().GameRoom("r").connect();
    conn.send({ type: "join", name: "alice" });
    expect(sockets[0].sent).toContain(JSON.stringify({ type: "join", name: "alice" }));
  });

  test("close() tears down socket and all listeners", () => {
    const conn = mod().GameRoom("r").connect();
    const got: unknown[] = [];
    conn.subscribe((m) => got.push(m));
    expect(conn.closed).toBe(false);
    conn.close();
    expect(conn.closed).toBe(true);
    expect(sockets[0].closed).toBe(true);
    // a late message reaches nobody (listeners cleared)
    sockets[0].message({ type: "tick" });
    expect(got).toHaveLength(0);
    let sendError: unknown;
    let subscribeError: unknown;
    try {
      conn.send({ type: "after-close" });
    } catch (error) {
      sendError = error;
    }
    try {
      conn.subscribe(() => {});
    } catch (error) {
      subscribeError = error;
    }
    expect(sendError).toBeInstanceOf(ActorConnectionError);
    expect(subscribeError).toBeInstanceOf(ActorConnectionError);
    expect(sendError).not.toBe(subscribeError);
    expect(sendError).toMatchObject({
      actorName: "GameRoom",
      instanceId: "r",
      cause: expect.objectContaining({ message: "Connection is closed" }),
    });
    expect(sockets[0].sent).toHaveLength(0);
  });

  test("connect() after close() opens a fresh socket with a new id", () => {
    const ref = mod().GameRoom("r");
    const c1 = ref.connect({ id: "c1" });
    expect(sockets).toHaveLength(1);
    c1.close();
    const c2 = ref.connect({ id: "c2" });
    expect(sockets).toHaveLength(2); // a new socket, not the closed one reused
    expect(c2.id).toBe("c2");
  });

  test("each GameRoom(id) is an independent connection", () => {
    const actors = mod();
    actors.GameRoom("r").connect();
    actors.GameRoom("r").connect();
    expect(sockets).toHaveLength(2);
  });

  test("heartbeat pings periodically and reconnects when the link goes silent", () => {
    vi.useFakeTimers();
    try {
      mod().GameRoom("r").connect();
      const ws = sockets[0];
      const reconnect = vi.spyOn(ws, "reconnect");
      ws.emit("open", {});
      vi.advanceTimersByTime(1000); // one PING_MS tick, still within DEAD_MS
      expect(ws.sent).toContain(JSON.stringify({ type: "__ping" }));
      expect(reconnect).not.toHaveBeenCalled();
      vi.advanceTimersByTime(4000); // no inbound message → exceed DEAD_MS
      expect(reconnect).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(12_000);
      expect(reconnect).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  test("watchdog stays disarmed while bootstrap has never opened", async () => {
    vi.useFakeTimers();
    try {
      const error = Object.assign(new Error("Service unavailable"), {
        isAxiosError: true,
        response: { status: 503 },
      });
      post.mockRejectedValue(error);
      mod().GameRoom("r").connect();
      const ws = sockets[0];
      const reconnect = vi.spyOn(ws, "reconnect");
      await expect(ws.urls[0]).rejects.toThrow("Service unavailable");

      vi.advanceTimersByTime(12_000);
      expect(reconnect).not.toHaveBeenCalled();
      expect(ws.urls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("module is not thenable (then must not resolve to an actor factory)", () => {
    const actors = mod() as unknown as { then?: unknown };
    expect(actors.then).toBeUndefined();
  });

  test("closeAll() closes every open connection", () => {
    const { module, closeAll } = createActorsModule(config);
    module.GameRoom("a").connect();
    module.GameRoom("b").connect();
    expect(sockets.filter((s) => s.closed)).toHaveLength(0);
    closeAll();
    expect(sockets.every((s) => s.closed)).toBe(true);
  });

  test("closeAll() is safe after an individual close() and closes the rest", () => {
    const { module, closeAll } = createActorsModule(config);
    const a = module.GameRoom("a").connect();
    module.GameRoom("b").connect();
    a.close();
    expect(() => closeAll()).not.toThrow();
    expect(sockets.every((s) => s.closed)).toBe(true);
  });
});

describe("resolveActorsHost", () => {
  test("absolute serverUrl is used as-is", () => {
    expect(resolveActorsHost("https://api.example", "https://tab.example")).toBe(
      "https://api.example",
    );
  });

  test("empty serverUrl falls back to the browser origin", () => {
    expect(resolveActorsHost("", "https://tab.example")).toBe("https://tab.example");
  });

  test("relative serverUrl (/api) falls back to the browser origin", () => {
    expect(resolveActorsHost("/api", "https://tab.example")).toBe("https://tab.example");
  });

  test("no origin available (non-browser) returns the serverUrl unchanged", () => {
    expect(resolveActorsHost("", undefined)).toBe("");
  });
});
