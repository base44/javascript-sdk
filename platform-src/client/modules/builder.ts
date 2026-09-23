import type { PlatformClientOptions } from "../client.types.js";
import { BuilderSocket } from "./builder-socket.js";
import type { BuilderModule } from "./builder.types.js";

/** @internal */
export function createBuilder(config: PlatformClientOptions): BuilderModule {
  return {
    init(options) { return new BuilderSocket(config, options); },
  };
}
