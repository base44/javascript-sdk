import { Base44PlatformError } from "./errors.js";
import type { PlatformClientConfig, TokenRequestOptions } from "./types.js";
import { InMemoryTokenStore } from "./token-store.js";
import { Tokens } from "./tokens.js";
import { Transport, checkAbort, waitFor } from "./transport.js";
import { createUsers } from "./modules/users.js";
import type { UsersModule } from "./modules/users.types.js";
import { createApps } from "./modules/apps.js";
import type { AppsModule } from "./modules/apps.types.js";
import { externalId, identifier, invalid, positive } from "./validation.js";

/** Immutable server-side view of one provisioned user; never a browser session. */
export interface PlatformUserClient {
  /** Canonical caller-owned external ID, not the Base44 user ID. */
  readonly externalId: string;
  /** App operations authenticated as this user. */
  readonly apps: AppsModule;
  /** Lazily mint/reuse a server credential. Never send the result to the browser. */
  getAccessToken(options?: TokenRequestOptions): Promise<string>;
  /** Revoke refresh credentials and clear storage even if remote revocation fails. Does not deprovision. */
  revokeToken(): Promise<void>;
}

/** Server-only client for provisioning users and managing their apps.
 * @example
 * const platform = new Base44PlatformClient({ apiKey, workspaceId });
 * await platform.users.provision({ externalId: "customer_42" });
 * const apps = await platform.asUser("customer_42").apps.list();
 */
export class Base44PlatformClient {
  /** Explicit identity provisioning and offboarding, using the configured workspace API key. */
  readonly users: UsersModule;
  #transport: Transport;
  #tokens: Tokens;
  #workspaceId: string;
  #buildTimeoutMs: number;

  /** Construct without network access. One key must support provisioning and minting. */
  constructor(config: PlatformClientConfig) {
    if (typeof window !== "undefined") throw new Base44PlatformError("server_only", "The platform client must run on your server.");
    if (typeof config.apiKey !== "string" || !config.apiKey.trim()) invalid("apiKey is required.");
    identifier(config.workspaceId);
    let url: URL;
    try { url = new URL(config.serverUrl ?? "https://base44.app"); }
    catch { invalid("serverUrl must be an absolute HTTP(S) URL."); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) invalid("serverUrl must be an HTTP(S) URL without credentials, query or fragment.");
    const serverUrl = url.toString().replace(/\/+$/, "");
    this.#workspaceId = config.workspaceId;
    this.#buildTimeoutMs = positive(config.buildTimeoutMs ?? 120_000);
    this.#transport = new Transport(serverUrl, config.fetch ?? globalThis.fetch, positive(config.timeoutMs ?? 30_000));
    this.#tokens = new Tokens(this.#transport, config.tokenStore ?? new InMemoryTokenStore(), config.apiKey, { serverUrl, workspaceId: config.workspaceId });
    this.users = Object.freeze(createUsers(this.#transport, this.#tokens, config.apiKey));
  }
  /** Bind a previously provisioned external user ID. Lazy, synchronous and safe to call concurrently. */
  asUser(value: string): PlatformUserClient {
    const id = externalId(value);
    return Object.freeze({
      externalId: id,
      apps: Object.freeze(createApps(this.#transport, this.#tokens, id, this.#workspaceId, this.#buildTimeoutMs)),
      getAccessToken: async (options: TokenRequestOptions = {}) => {
        checkAbort(options.signal);
        return waitFor(this.#tokens.get(id, options.forceRefresh), options.signal);
      },
      revokeToken: () => this.#tokens.revoke(id),
    });
  }
}
