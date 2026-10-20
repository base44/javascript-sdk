// Entry point for the Mintlify reference only, not part of the package. Re-exports the client,
// server and React entrypoints as one flat module, which is the layout the post-processing expects.
export * from "../../src/client/index.js";
export * from "../../src/server/index.js";
export * from "../../src/react/index.js";
// The client also exports a generated SecretField (a socket shape no page shows); the reference
// documents the React one, which partners use.
export type { SecretField } from "../../src/react/index.js";
