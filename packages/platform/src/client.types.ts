import type { BuilderModule } from "./modules/builder.types.js";

/**
 * Options for {@linkcode createPlatformClient | createPlatformClient()}.
 *
 * The client runs in the browser and never sees your workspace API key. Your server opens a socket
 * session with the key and hands the browser only the session's token and socket URL.
 */
export interface PlatformClientOptions {
  /**
   * Origin of the platform socket.
   *
   * Use the `socket_url` your server receives from `POST /api/service/socket-sessions`. It must be
   * an origin with no path, query, fragment, or credentials.
   */
  socketUrl: string;
  /**
   * Returns a socket session token from your server.
   *
   * Your server opens a session with `POST /api/service/socket-sessions` and returns its
   * `session_token`. The client calls this when it connects, and again when the token expires.
   * Return a new token on every call.
   *
   * @returns The session token, or a promise resolving to it.
   */
  getSessionToken: () => string | Promise<string>;
}

/**
 * The platform client.
 *
 * Provides access to the platform's modules.
 */
export interface PlatformClient {
  /** [Builder module](/developers/references/platform-sdk/docs/interfaces/builder) for following the AI chat in your users' apps live. */
  readonly builder: BuilderModule;
}
