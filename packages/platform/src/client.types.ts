/**
 * Options for creating a {@link Base44PlatformClient}.
 *
 * The client runs in the browser and never sees your workspace API key. Your server opens a socket
 * session with the key and hands the browser only the session's token and socket URL.
 */
export interface PlatformClientOptions {
  /**
   * Origin of the platform socket, such as `https://app.base44.com`.
   *
   * Use the `socket_url` your server receives from `POST /api/service/socket-sessions`. It must be
   * an origin with no path, query, fragment, or credentials.
   */
  serverUrl: string;
  /**
   * Returns a socket session token from your server.
   *
   * Your server opens a session with its workspace API key through
   * `POST /api/service/socket-sessions`, for the apps this page shows, and returns the
   * `session_token`. The client calls this when a builder session first connects, and again only
   * after Base44 rejects or expires the current token. Sessions last one hour. Open a new session
   * on every call instead of returning a cached token.
   *
   * It must settle within 20 seconds and return a non-empty token, or the session reports
   * `session_unavailable`. Never return a workspace API key or any other server credential.
   *
   * @returns The session token, or a promise resolving to it.
   */
  getSessionToken: () => string | Promise<string>;
}
