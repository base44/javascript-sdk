import type { PlatformClientOptions } from "./client.types.js";
import { createBuilder } from "./modules/builder.js";
import type { BuilderModule } from "./modules/builder.types.js";

/** Browser platform client. Construction creates no sockets, timers or network requests. */
export class Base44PlatformClient {
  /** Lazy builder subscriptions with independent session lifecycles. */
  readonly builder: BuilderModule;

  /** Configure shared service/auth settings; each module initializes its own resources. */
  constructor(options: PlatformClientOptions) {
    const url = new URL(options.serverUrl);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new TypeError("serverUrl must be an HTTP(S) origin without credentials, path, query or fragment");
    }
    this.builder = Object.freeze(createBuilder({ ...options, serverUrl: url.origin }));
  }
}
