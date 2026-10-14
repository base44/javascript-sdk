/** Shared configuration for server platform modules. */
export interface PlatformServerOptions {
  /** Origin of the platform service, e.g. https://base44.app. No path/query/credentials. */
  serverUrl: string;
  /** Workspace API key. Keep it on your server; never ship it to a browser. */
  apiKey: string;
}

/** Server platform client, returned by `createPlatformServer`. Modules are added as properties. */
export interface PlatformServer {}
