import { io, type Socket } from "socket.io-client";
import { PlatformSocketError } from "./errors.js";
import { appFromRoom, appPattern, decode, decodeJoined, errorCodes, eventApp, eventNames, object, roomFor } from "./protocol.js";
import { notify, Subscription } from "./subscription.js";
import type { PlatformClientOptions, PlatformSubscription, SubscriptionOptions } from "./types.js";

/** Browser client for read-only platform app events. Constructing it opens no connection. */
export class Base44PlatformClient {
  private readonly socket: Socket;
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly options: PlatformClientOptions;
  private closed = false;
  private needsFreshConnection = false;
  private generation = 0;
  private authAttempt = 0;
  private cancelAuth?: () => void;
  private connecting?: Promise<void>;
  private resolveConnect?: () => void;
  private rejectConnect?: (error: PlatformSocketError) => void;

  /** Configure a dedicated connection. API keys belong exclusively on your backend. */
  constructor(options: PlatformClientOptions) {
    const url = new URL(options.serverUrl);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new TypeError("serverUrl must be an HTTP(S) origin without credentials, path, query or fragment");
    }
    this.options = { ...options };
    this.socket = io(`${url.origin}/partner`, {
      path: "/ws-whitelabel/socket.io/", transports: ["websocket"], autoConnect: false,
      forceNew: true, reconnectionAttempts: 5, reconnectionDelay: 1000, reconnectionDelayMax: 10000,
      timeout: 20000,
      auth: (callback) => { void this.authenticate(callback); },
    });
    this.socket.on("connect", () => {
      const generation = ++this.generation;
      this.needsFreshConnection = false;
      for (const subscription of this.subscriptions.values()) this.join(subscription, generation);
      this.resolveConnect?.();
      this.clearConnecting();
    });
    this.socket.on("disconnect", (reason) => {
      ++this.generation;
      ++this.authAttempt;
      if (reason === "io server disconnect") this.connectionError(new PlatformSocketError("connection_failed"));
    });
    this.socket.on("connect_error", (error) => {
      this.connectionError(new PlatformSocketError((error as Error & { data?: { code?: string } }).data?.code === "connection_denied" ? "connection_denied" : "connection_failed"));
    });
    this.socket.io.on("reconnect_failed", () => this.connectionError(new PlatformSocketError("connection_failed")));
    this.socket.on("joined", (raw: unknown) => {
      try {
        const joined = decodeJoined(raw);
        this.subscriptions.get(appFromRoom(joined.room)!)?.joined(joined);
      } catch { this.protocolError(raw); }
    });
    this.socket.on("error", (raw: unknown) => this.serverError(raw));
    for (const type of eventNames) this.socket.on(type, (raw: unknown) => {
      try {
        const appId = eventApp(type, raw);
        if (!appId) throw new Error("Invalid app");
        this.subscriptions.get(appId)?.event(decode(type, appId, raw));
      } catch { this.protocolError(raw); }
    });
  }

  /** Connect using a freshly obtained token. Resolves on CONNECT, not on app replay completion.
   * Unexpected transport loss retries up to five times and rejoins active subscriptions.
   * Call again after addressing a connection/auth failure; concurrent calls share one attempt.
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

  /** Subscribe before or after connecting. One subscription per app, maximum eight.
   * Events and boundary callbacks are awaited in order per app. Failed application,
   * invalid frames or server errors end the subscription without advancing its cursor.
   */
  subscribe(appId: string, options: SubscriptionOptions): PlatformSubscription {
    if (this.closed) throw new PlatformSocketError("client_closed");
    if (!appPattern.test(appId)) throw new TypeError("appId must be 24 lowercase hexadecimal characters");
    if (options.afterSeq !== undefined && (typeof options.afterSeq !== "string" || !options.afterSeq)) throw new TypeError("afterSeq must be a nonempty opaque cursor");
    if (this.subscriptions.has(appId)) throw new TypeError("An app may only have one subscription per client");
    if (this.subscriptions.size >= 8) throw new PlatformSocketError("subscription_limit", appId);
    const subscription = new Subscription(appId, { ...options }, () => {
      this.subscriptions.delete(appId);
      this.needsFreshConnection = true;
      if (this.socket.connected) this.socket.emit("leave", roomFor(appId));
    });
    this.subscriptions.set(appId, subscription);
    if (this.socket.connected && this.needsFreshConnection) {
      // Leave has no acknowledgement; a new transport fences late events from retired streams.
      this.socket.disconnect();
      void this.connect().catch(() => {}); // Connection errors are delivered through onError.
    } else if (this.socket.connected) {
      this.join(subscription, this.generation);
    }
    return subscription;
  }

  /** Stop delivery, cancel reconnection and release all listeners. Idempotent and terminal. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    ++this.authAttempt;
    this.cancelAuth?.();
    ++this.generation;
    for (const subscription of this.subscriptions.values()) subscription.unsubscribe();
    this.rejectConnect?.(new PlatformSocketError("client_closed"));
    this.clearConnecting();
    this.socket.removeAllListeners();
    this.socket.io.removeAllListeners();
    this.socket.disconnect();
  }

  private join(subscription: Subscription, generation: number): void {
    subscription.join((cursor) => {
      if (this.socket.connected && generation === this.generation) {
        this.socket.emit("join", roomFor(subscription.appId), cursor === undefined ? {} : { after_seq: cursor });
      }
    });
  }

  private async authenticate(callback: (auth: { token: string }) => void): Promise<void> {
    const attempt = ++this.authAttempt;
    this.cancelAuth?.();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Token timeout")), 20000);
      this.cancelAuth = () => { clearTimeout(timer); reject(new Error("Cancelled")); };
    });
    try {
      const token = await Promise.race([Promise.resolve().then(() => this.options.getToken()), timeout]);
      if (this.closed || attempt !== this.authAttempt) return;
      if (typeof token !== "string" || !token.trim()) throw new Error("Missing token");
      callback({ token });
    } catch {
      if (this.closed || attempt !== this.authAttempt) return;
      this.socket.disconnect();
      this.connectionError(new PlatformSocketError("token_unavailable"));
    } finally {
      clearTimeout(timer);
      if (attempt === this.authAttempt) this.cancelAuth = undefined;
    }
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

  private serverError(raw: unknown): void {
    try {
      const frame = object(raw);
      const code = errorCodes.find((code) => code === frame.code);
      if (!code) throw new Error("Unknown error");
      const appId = appFromRoom(frame.room);
      if (appId) this.subscriptions.get(appId)?.fail(code);
      else if (frame.room === null) this.connectionError(new PlatformSocketError(code));
      else throw new Error("Invalid room");
    } catch { this.protocolError(raw); }
  }

  private protocolError(raw: unknown): void {
    const frame = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const appId = appFromRoom(frame.room) ?? (typeof frame.app_id === "string" && appPattern.test(frame.app_id) ? frame.app_id : undefined);
    if (appId) this.subscriptions.get(appId)?.fail("protocol_error");
    else {
      // Unknown routing means no app cursor can safely advance past this frame.
      for (const subscription of [...this.subscriptions.values()]) subscription.fail("protocol_error");
      this.connectionError(new PlatformSocketError("protocol_error"));
    }
  }
}
