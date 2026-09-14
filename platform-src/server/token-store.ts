import type { TokenKey, TokenRecord, TokenStore } from "./types.js";

/** Process-local storage. Reuse a client to reuse tokens; no cross-process synchronization. */
export class InMemoryTokenStore implements TokenStore {
  #records = new Map<string, TokenRecord>();
  /** Return a copy, or null when absent. */
  async get(key: TokenKey): Promise<TokenRecord | null> {
    const record = this.#records.get(JSON.stringify([key.serverUrl, key.workspaceId, key.externalId]));
    return record ? { ...record } : null;
  }
  /** Store a copy, isolated by URL, workspace and external user ID. */
  async set(key: TokenKey, record: TokenRecord): Promise<void> {
    this.#records.set(JSON.stringify([key.serverUrl, key.workspaceId, key.externalId]), { ...record });
  }
  /** Remove cached credentials; does not revoke them remotely. */
  async delete(key: TokenKey): Promise<void> {
    this.#records.delete(JSON.stringify([key.serverUrl, key.workspaceId, key.externalId]));
  }
}
