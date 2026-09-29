import { Base44PlatformError } from "./errors.js";
import { Transport } from "./transport.js";
import type { TokenKey, TokenRecord, TokenStore } from "./types.js";
import { object, requiredString, nullableString, badResponse } from "./validation.js";

export class Tokens {
  #generation = new Map<string, number>();
  #pending = new Map<string, Promise<unknown>>();
  constructor(private transport: Transport, private store: TokenStore, private apiKey: string, private base: Omit<TokenKey, "externalId">) {}

  async exclusive<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const prior = this.#pending.get(id);
    const task = (async () => { await prior?.catch(() => {}); return operation(); })();
    this.#pending.set(id, task);
    try { return await task; }
    finally { if (this.#pending.get(id) === task) this.#pending.delete(id); }
  }
  async storage<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch { throw new Base44PlatformError("token_store_error", "Token storage could not complete the operation."); }
  }
  key(id: string): TokenKey { return { ...this.base, externalId: id }; }

  async get(id: string, force = false): Promise<string> {
    // Capture before joining the queue so concurrent forced renewals share the new token.
    const generation = this.#generation.get(id) ?? 0;
    return this.exclusive(id, async () => {
      const key = this.key(id);
      const held = await this.storage(() => this.store.get(key));
      const now = Date.now();
      if (held && (held.renewAt ?? held.expiresAt) > now && (!force || (this.#generation.get(id) ?? 0) !== generation)) return held.accessToken;
      const data = object(await this.transport.request("/api/service/user-tokens", "POST", {
        Authorization: this.apiKey, "Content-Type": "application/json",
      }, { service_external_id: id }));
      const lifetime = Number(data.expires_in) * 1000;
      if (!Number.isFinite(lifetime) || lifetime <= 0) return badResponse();
      const issuedAt = Date.now();
      const record: TokenRecord = {
        accessToken: requiredString(data.access_token), refreshToken: nullableString(data.refresh_token),
        expiresAt: issuedAt + lifetime,
        renewAt: issuedAt + lifetime - Math.min(300_000, lifetime / 2),
      };
      await this.storage(() => this.store.set(key, record));
      this.#generation.set(id, (this.#generation.get(id) ?? 0) + 1);
      return record.accessToken;
    });
  }
  async remove(id: string): Promise<void> {
    await this.storage(() => this.store.delete(this.key(id)));
  }
  async revoke(id: string): Promise<void> {
    return this.exclusive(id, async () => {
      const record = await this.storage(() => this.store.get(this.key(id)));
      try {
        if (record?.refreshToken) await this.transport.request("/oauth/revoke", "POST", {
          "Content-Type": "application/x-www-form-urlencoded",
        }, new URLSearchParams({ token: record.refreshToken, client_id: "svc_delegate" }));
      } finally { await this.remove(id); }
    });
  }
}
