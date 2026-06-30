/**
 * A subscription handle returned by {@link RealtimeHandlerClient.subscribe}.
 */
export interface RealtimeSubscription {
  /** Send a message to all subscribers of this instance. */
  send(data: unknown): void;
  /** Close the WebSocket connection and remove the subscription. */
  close(): void;
}

/**
 * Client for a single named RealtimeHandler.
 */
export interface RealtimeHandlerClient {
  /**
   * Subscribe to messages from a specific RealtimeHandler instance.
   *
   * @param instanceId - The instance ID of the Durable Object.
   * @param callback - Called with each parsed message payload.
   * @returns A subscription handle with `send` and `close` methods.
   */
  subscribe(
    instanceId: string,
    callback: (data: unknown) => void,
  ): Promise<RealtimeSubscription>;

  /**
   * Send a message to an existing active subscription.
   *
   * @param instanceId - The instance ID of the Durable Object.
   * @param data - The data to send (will be JSON-serialized).
   * @throws {Error} When no active subscription exists for this handler/instance pair.
   */
  send(instanceId: string, data: unknown): void;
}

/**
 * The realtime module provides access to Cloudflare Durable Object-backed
 * RealtimeHandlers deployed by the Base44 platform.
 *
 * Handler names are accessed as dynamic properties on this module:
 * ```typescript
 * const sub = await base44.realtime.MyHandler.subscribe("room-1", (msg) => {
 *   console.log(msg);
 * });
 * sub.send({ text: "hello" });
 * sub.close();
 * ```
 */
export type RealtimeModule = Record<string, RealtimeHandlerClient>;
