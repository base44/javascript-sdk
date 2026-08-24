import { describe, test, expect, vi, beforeEach } from "vitest";

// The main actors suite replaces PartySocket's WebSocket with a fake that
// hand-models its event ordering — so it would keep passing if PartySocket
// changed that ordering underneath us. These tests drive the REAL
// ReconnectingWebSocket against a stub raw socket instead, pinning the one
// library detail the reporting logic depends on: `_handleError` dispatches a
// synthetic `close` (code 1000) *before* the `error` carrying the real cause,
// so a transport failure must report once, with the cause, and not as a 1000.
//
// `partysocket` is pinned to an exact patch ("^0.0.23" on a 0.0.x version), so
// this can only break on a deliberate bump. That is exactly when it should.
import { createActorsModule } from "../../src/modules/actors.ts";
import type { ActorConnectionError } from "../../src/modules/actors.error.ts";

const rawSockets: StubWebSocket[] = [];

class StubWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  binaryType = "blob";
  private handlers: Record<string, ((ev: any) => void)[]> = {};

  constructor(readonly url: string) {
    rawSockets.push(this);
  }
  addEventListener(type: string, fn: (ev: any) => void) {
    (this.handlers[type] ??= []).push(fn);
  }
  removeEventListener(type: string, fn: (ev: any) => void) {
    this.handlers[type] = (this.handlers[type] ?? []).filter((h) => h !== fn);
  }
  send() {}
  close() {
    this.readyState = 3;
  }
  private fire(type: string, event: Record<string, unknown> = {}) {
    for (const handler of [...(this.handlers[type] ?? [])]) {
      handler({ type, target: this, ...event });
    }
  }
  /** Handshake succeeded. */
  open() {
    this.readyState = 1;
    this.fire("open");
  }
  /** The far end sent a close frame (e.g. the actor called conn.reject). */
  remoteClose(code: number, reason = "") {
    this.readyState = 3;
    this.fire("close", { code, reason });
  }
  /** A transport-level failure, as a browser reports it. */
  fail(message: string) {
    this.fire("error", { message, error: new Error(message) });
  }
}

function connect() {
  const reported: ActorConnectionError[] = [];
  const post = vi.fn().mockResolvedValue({
    status: 200,
    data: { websocket_url: "wss://actors.example/v1/actors/a/rooms/r", token: "t" },
  });
  const actors = createActorsModule({
    appId: "app-1",
    host: "https://app.example",
    connectionClient: { post } as any,
    getAuthToken: () => "user-tok",
    onError: (error) => reported.push(error),
  }).module;
  return { conn: actors.GameRoom("r").connect({ id: "c1" }), reported, post };
}

/** Let the async bootstrap (POST + PartySocket's queued reconnect) land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("PartySocket event-ordering contract", () => {
  beforeEach(() => {
    rawSockets.length = 0;
    vi.stubGlobal("WebSocket", StubWebSocket);
  });

  test("a transport failure reports once, with its cause, not as a synthetic 1000", async () => {
    const { conn, reported } = connect();
    await settle();
    expect(rawSockets).toHaveLength(1);

    rawSockets[0].open();
    rawSockets[0].fail("connection reset");
    await settle();

    // One report. If the synthetic close leaked through we would see two, and
    // the 1000 would have been misread as a clean shutdown.
    expect(reported).toHaveLength(1);
    expect(reported[0].closeCode).toBeUndefined();
    expect((reported[0].cause as Error).message).toBe("connection reset");
    expect(conn.closed).toBe(false);

    conn.close();
  });

  test("an actor rejection in the app-defined range terminates on the first close", async () => {
    const { conn, reported } = connect();
    await settle();

    rawSockets[0].open();
    rawSockets[0].remoteClose(4001, "not allowed");
    await settle();

    expect(reported).toHaveLength(1);
    expect(reported[0]).toMatchObject({ closeCode: 4001, closeReason: "not allowed" });
    expect(conn.closed).toBe(true);
    // Terminal means no further token purchases.
    expect(rawSockets).toHaveLength(1);
  });

  test("a dropped link reports once and keeps retrying", async () => {
    vi.useFakeTimers();
    try {
      const { conn, reported, post } = connect();
      await vi.advanceTimersByTimeAsync(30);

      rawSockets[0].open();
      rawSockets[0].remoteClose(1006);
      await vi.advanceTimersByTimeAsync(30);

      expect(reported).toHaveLength(1);
      expect(reported[0].closeCode).toBe(1006);
      expect(conn.closed).toBe(false);

      // PartySocket's first retry waits its 1-5s randomized base delay, so step
      // past the top of that range to confirm it really did re-bootstrap.
      await vi.advanceTimersByTimeAsync(5_200);
      expect(post.mock.calls.length).toBeGreaterThan(1);
      expect(rawSockets.length).toBeGreaterThan(1);

      conn.close();
    } finally {
      vi.useRealTimers();
    }
  });

  test("a heartbeat-forced reconnect reports once and stays open", async () => {
    vi.useFakeTimers();
    try {
      const { conn, reported } = connect();
      await vi.advanceTimersByTimeAsync(30);
      rawSockets[0].open();

      // No inbound traffic for more than DEAD_MS: the watchdog reconnects.
      await vi.advanceTimersByTimeAsync(5_000);

      expect(reported).toHaveLength(1);
      expect((reported[0].cause as Error).message).toBe(
        "Actor WebSocket stopped responding",
      );
      expect(reported[0].closeCode).toBeUndefined();
      expect(conn.closed).toBe(false);

      conn.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
