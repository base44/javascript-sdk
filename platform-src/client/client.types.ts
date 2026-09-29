/** Shared configuration for browser platform modules. Never supply an API key. */
export interface PlatformClientOptions {
  /** Origin of the platform service, e.g. https://base44.app. No path/query/credentials. */
  serverUrl: string;
  /**
   * Return a socket-session token from your backend, which opens the session with its
   * workspace key (`POST /api/service/socket-sessions`) for the apps this page watches.
   * Called when a builder session first connects, and again only after the server
   * rejects or expires the current session. Sessions last one hour.
   */
  getSessionToken: () => string | Promise<string>;
}
