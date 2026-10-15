import { BuilderSocket } from "./builder-socket.js";
import type { BuilderModule } from "./builder.types.js";

/** @internal */
export function createBuilder(): BuilderModule {
  return {
    init(options) { return new BuilderSocket(options); },
  };
}
