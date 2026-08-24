/** Contextual error for an Actor bootstrap, WebSocket, or closed-connection failure. */
export class ActorConnectionError extends Error {
  /** HTTP response status, when the failure came from the bootstrap request. */
  readonly status?: number;
  /** WebSocket close code, when the far end closed the connection. */
  readonly closeCode?: number;
  /** WebSocket close reason, when the far end supplied one. */
  readonly closeReason?: string;

  constructor(
    readonly actorName: string,
    readonly instanceId: string,
    readonly connectionId: string,
    readonly cause: unknown,
    status?: number,
    closeCode?: number,
    closeReason?: string,
  ) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super(
      `Actor "${actorName}" instance "${instanceId}" connection "${connectionId}": ${causeMessage}`,
    );
    this.name = "ActorConnectionError";
    this.status = status;
    this.closeCode = closeCode;
    this.closeReason = closeReason;
  }
}
