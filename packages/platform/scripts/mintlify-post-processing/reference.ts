// Entry point for the Mintlify reference only, not part of the package. Re-exports the client and
// server entrypoints as one flat module, which is the layout the post-processing expects.
export * from "../../src/client/index.js";
export * from "../../src/server/index.js";
