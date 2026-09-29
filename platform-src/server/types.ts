/** Per-call controls. Cancellation does not roll back an accepted server operation. */
export interface RequestOptions {
  /** Abort this caller's wait and HTTP request. Shared token minting may finish. */
  signal?: AbortSignal;
  /** HTTP timeout in milliseconds; overrides the method default. Must be positive. */
  timeoutMs?: number;
}

/** Persisted server credential. Never expose this record to a browser or logs. */
export interface TokenRecord {
  /** Opaque Base44 service-user access token. */
  accessToken: string;
  /** Refresh credential used only for revocation; null if not issued. */
  refreshToken: string | null;
  /** Access-token expiry, Unix epoch milliseconds. */
  expiresAt: number;
  /** Renew at this epoch millisecond timestamp; defaults to expiresAt when absent. */
  renewAt?: number;
}

/** Storage namespace. All three fields participate in isolation. */
export interface TokenKey {
  /** Normalized configured platform URL (no trailing slash). */
  serverUrl: string;
  /** Configured Base44 workspace ID, not an external user ID. */
  workspaceId: string;
  /** Caller-owned ID, trimmed and lowercased to match provisioning. */
  externalId: string;
}

/** Server-side storage adapter; operations must complete before their promise resolves. */
export interface TokenStore {
  /** Return a record or null on a miss. Do not log credentials. */
  get(key: TokenKey): Promise<TokenRecord | null>;
  /** Persist the complete record, replacing the previous one for this key. */
  set(key: TokenKey, record: TokenRecord): Promise<void>;
  /** Remove the record only; do not delete or provision the user. Missing is a no-op. */
  delete(key: TokenKey): Promise<void>;
}

/** Server-only platform client configuration. */
export interface PlatformClientConfig {
  /** Workspace key with service_users:provision and user_tokens:mint permissions. */
  apiKey: string;
  /** Workspace for app operations. Must match the workspace that owns apiKey. */
  workspaceId: string;
  /** Trusted server configuration; defaults to https://base44.app. Never use request input. */
  serverUrl?: string;
  /** Defaults to a private in-memory store per client instance. */
  tokenStore?: TokenStore;
  /** Fetch-compatible transport; defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /** Ordinary request timeout in milliseconds; default 30000. */
  timeoutMs?: number;
  /** Create/deploy timeout in milliseconds; default 120000. */
  buildTimeoutMs?: number;
}

/** Controls acquisition of a server credential for legacy integrations. */
export interface TokenRequestOptions {
  /** Abort this caller’s wait; shared acquisition may finish and populate storage. */
  signal?: AbortSignal;
  /** Re-mint even if cached; default false. Never provisions a missing user. */
  forceRefresh?: boolean;
}
