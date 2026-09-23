/** Shared configuration for browser platform modules. Never supply an API key. */
export interface PlatformClientOptions {
  /** Origin of the platform service, e.g. https://base44.app. No path/query/credentials. */
  serverUrl: string;
  /** Refresh a browser credential through your backend; called on every builder connection attempt. */
  refreshToken: () => string | Promise<string>;
}
