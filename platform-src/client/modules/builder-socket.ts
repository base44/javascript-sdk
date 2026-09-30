import { io, type Socket } from "socket.io-client";
import { PlatformSocketError } from "../errors.js";
import { appFromRoom, appPattern, decode, decodeSnapshot, eventNames, object, roomFor, roomNotices } from "./builder-protocol.js";
import { notify, Subscription } from "./builder-subscription.js";
import type { PlatformClientOptions } from "../client.types.js";
import type { BuilderInitOptions, BuilderSession, PlatformSubscription, SubscriptionOptions } from "./builder.types.js";

const MAX_DENIAL_RETRIES = 5;

/** @internal */
export class BuilderSocket implements BuilderSession {
  private readonly socket: Socket;
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly options: PlatformClientOptions & BuilderInitOptions;
  private closed = false;
  // The session token outlives reconnects; it is replaced only when the server rejects or expires it.
  private token?: string;
  private tokenFresh = false;
  private ending?: "session_expired" | "session_revoked" | "session_replaced";
  private denialRetries = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private authAttempt = 0;
  private cancelAuth?: () => void;
  private connecting?: Promise<void>;
  private resolveConnect?: () => void;
  private rejectConnect?: (error: PlatformSocketError) => void;

  constructor(config: PlatformClientOptions, options: BuilderInitOptions) {
    this.options = { ...config, onError: options.onError };
    this.socket = io(config.serverUrl, {
      path: "/ws/socket.io/", transports: ["websocket"], autoConnect: false,
      forceNew: true, reconnectionAttempts: 5, reconnectionDelay: 1000, reconnectionDelayMax: 10000,
      timeout: 20000,
      auth: (callback) => { void this.authenticate(callback); },
    });
    this.socket.on("connect", () => {
      this.tokenFresh = false;
      this.denialRetries = 0;
      for (const subscription of this.subscriptions.values()) this.join(subscription);
      this.resolveConnect?.();
      this.clearConnecting();
    });
    this.socket.on("disconnect", (reason) => {
      ++this.authAttempt;
      if (this.closed || reason !== "io server disconnect") return; // Transport loss reconnects by itself.
      const ending = this.ending;
      this.ending = undefined;
      if (ending === "session_expired") this.socket.connect(); // Renew through getSessionToken.
      else this.connectionError(new PlatformSocketError(ending ?? "connection_failed"));
    });
    this.socket.on("connect_error", (error) => this.refused(error as Error & { data?: { retryable?: boolean } }));
    this.socket.io.on("reconnect_failed", () => this.connectionError(new PlatformSocketError("connection_failed")));
    this.socket.on("app.snapshot", (raw: unknown) => {
      try {
        const snapshot = decodeSnapshot(raw);
        this.subscriptions.get(appFromRoom(snapshot.room)!)?.snapshot(snapshot);
      } catch { this.protocolError(raw); }
    });
    this.socket.on("session.ended", (raw: unknown) => this.sessionEnded(raw));
    for (const [name, code] of Object.entries(roomNotices)) this.socket.on(name, (raw: unknown) => this.roomNotice(code, raw));
    for (const type of eventNames) this.socket.on(type, (raw: unknown) => {
      try {
        const appId = appFromRoom(object(raw).room);
        if (!appId) throw new Error("Invalid app");
        const event = decode(type, appId, raw);
        const subscription = this.subscriptions.get(appId);
        subscription?.event(event);
        // The server does not resend a snapshot after a rewrite of main: rejoining asks for one.
        if (subscription && event.type === "conversation.changed" && event.data.branch_id == null) this.join(subscription);
      } catch { this.protocolError(raw); }
    });
  }

  /** Connect with the session token. Resolves on CONNECT, before snapshots arrive.
   * Transport loss retries up to five times and rejoins active subscriptions.
   * Call again after a failure or `session_replaced`; concurrent calls share one attempt.
   */
  connect(): Promise<void> {
    if (this.closed) return Promise.reject(new PlatformSocketError("client_closed"));
    if (this.socket.connected) return Promise.resolve();
    if (this.connecting) return this.connecting;
    const promise = new Promise<void>((resolve, reject) => {
      this.resolveConnect = resolve;
      this.rejectConnect = reject;
    });
    this.connecting = promise;
    this.socket.connect();
    return promise;
  }

  /** Subscribe before or after connecting. One subscription per app, maximum eight, each on the
   * session's allowlist. Snapshots and events are awaited in order per app; a failed callback,
   * an invalid frame or a server refusal ends the subscription.
   */
  subscribe(appId: string, options: SubscriptionOptions): PlatformSubscription {
    if (this.closed) throw new PlatformSocketError("client_closed");
    if (!appPattern.test(appId)) throw new TypeError("appId must be 24 lowercase hexadecimal characters");
    if (this.subscriptions.has(appId)) throw new TypeError("An app may only have one subscription per builder session");
    if (this.subscriptions.size >= 8) throw new PlatformSocketError("subscription_limit", appId);
    const subscription = new Subscription(appId, { ...options }, () => {
      this.subscriptions.delete(appId);
      if (this.socket.connected) this.socket.emit("leave", roomFor(appId));
    });
    this.subscriptions.set(appId, subscription);
    if (this.socket.connected) this.join(subscription);
    return subscription;
  }

  /** Stop delivery, cancel reconnection and release all listeners. Idempotent and terminal. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    ++this.authAttempt;
    this.cancelAuth?.();
    clearTimeout(this.retryTimer);
    for (const subscription of this.subscriptions.values()) subscription.unsubscribe();
    this.rejectConnect?.(new PlatformSocketError("client_closed"));
    this.clearConnecting();
    this.socket.removeAllListeners();
    this.socket.io.removeAllListeners();
    this.socket.disconnect();
  }

  private join(subscription: Subscription): void {
    this.socket.emit("join", roomFor(subscription.appId));
  }

  private async authenticate(callback: (auth: { session_token: string }) => void): Promise<void> {
    const attempt = ++this.authAttempt;
    this.cancelAuth?.();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Session token timeout")), 20000);
      this.cancelAuth = () => { clearTimeout(timer); reject(new Error("Cancelled")); };
    });
    try {
      if (!this.token) {
        const token = await Promise.race([Promise.resolve().then(() => this.options.getSessionToken()), timeout]);
        if (this.closed || attempt !== this.authAttempt) return;
        if (typeof token !== "string" || !token.trim()) throw new Error("Missing session token");
        this.token = token;
        this.tokenFresh = true;
      }
      callback({ session_token: this.token });
    } catch {
      if (this.closed || attempt !== this.authAttempt) return;
      this.socket.disconnect();
      this.connectionError(new PlatformSocketError("session_unavailable"));
    } finally {
      clearTimeout(timer);
      if (attempt === this.authAttempt) this.cancelAuth = undefined;
    }
  }

  /** A connect the server refused. Transport errors are Socket.IO's to retry. */
  private refused(error: Error & { data?: { retryable?: boolean } }): void {
    if (this.closed || error.message !== "connection_denied") return;
    if (error.data?.retryable === true) { this.retryDenied(); return; }
    // A token this attempt did not just fetch may have expired: renew it once.
    const renew = !this.tokenFresh;
    this.token = undefined;
    if (renew) this.socket.connect();
    else this.connectionError(new PlatformSocketError("connection_denied"));
  }

  private retryDenied(): void {
    if (++this.denialRetries > MAX_DENIAL_RETRIES) {
      this.denialRetries = 0;
      this.connectionError(new PlatformSocketError("connection_failed"));
      return;
    }
    const delay = Math.min(1000 * 2 ** (this.denialRetries - 1), 10000) * (0.5 + Math.random() / 2);
    this.retryTimer = setTimeout(() => { this.retryTimer = undefined; if (!this.closed) this.socket.connect(); }, delay);
  }

  private clearConnecting(): void {
    this.connecting = undefined;
    this.resolveConnect = undefined;
    this.rejectConnect = undefined;
  }

  private connectionError(error: PlatformSocketError): void {
    this.rejectConnect?.(error);
    this.clearConnecting();
    if (!this.closed) notify(this.options.onError, error);
  }

  private sessionEnded(raw: unknown): void {
    try {
      const reason = object(object(raw).data).reason;
      const ending = reason === "expired" ? "session_expired"
        : reason === "revoked" ? "session_revoked"
        : reason === "replaced" ? "session_replaced" : undefined;
      if (!ending) throw new Error("Unknown reason");
      // The server disconnects next; the disconnect handler renews or stops.
      this.token = undefined;
      this.ending = ending;
    } catch { this.protocolError(raw); }
  }

  private roomNotice(code: (typeof roomNotices)[keyof typeof roomNotices], raw: unknown): void {
    try {
      const appId = appFromRoom(object(raw).room);
      if (!appId) throw new Error("Invalid app");
      const subscription = this.subscriptions.get(appId);
      if (code === "snapshot_unavailable") subscription?.warn(code);
      else subscription?.fail(code);
    } catch { this.protocolError(raw); }
  }

  private protocolError(raw: unknown): void {
    const frame = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const appId = appFromRoom(frame.room);
    if (appId) this.subscriptions.get(appId)?.fail("protocol_error");
    else {
      // Unknown routing: no app can be told which update it missed.
      for (const subscription of [...this.subscriptions.values()]) subscription.fail("protocol_error");
      this.connectionError(new PlatformSocketError("protocol_error"));
    }
  }
}
