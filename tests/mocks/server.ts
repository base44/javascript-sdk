import { setupServer } from "msw/node";
import { platformHandlers } from "./platform";

/**
 * Transport boundary for the reusable mock Base44 platform.
 *
 * Handlers live in `tests/mocks/platform`, model shared domain state, and are
 * installed once here. Tests arrange that state through `platform.given`, act
 * only through the SDK, and may inspect the request journal for wire-level
 * contracts. The global test lifecycle resets state and the journal per test.
 * Module tests must not register ad-hoc handlers or author response bodies.
 */
export const server = setupServer(...platformHandlers);
