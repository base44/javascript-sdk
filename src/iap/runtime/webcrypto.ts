/**
 * The only place in the in-app purchase module that touches a global.
 *
 * Everything the module needs — WebCrypto, `TextEncoder`, `fetch` — is a web
 * standard present in Deno, in Node 18 and later, and in a secure browser
 * context. Reading them through accessors buys three things:
 *
 * 1. A missing global fails with a named error that says what is required,
 *    instead of `undefined is not a function` somewhere inside a certificate
 *    parser.
 * 2. Importing this module can never throw, so a React Native bundle that
 *    reaches it by accident still loads.
 * 3. There is exactly one file to audit for runtime assumptions.
 *
 * There is deliberately **no** software-crypto fallback. A verifier that
 * silently stops verifying is worse than an outage.
 *
 * @internal
 */
import { IapConfigError } from "../errors.js";

/**
 * The WebCrypto `subtle` interface.
 *
 * @throws {IapConfigError} `IAP_WEBCRYPTO_UNAVAILABLE` when the runtime has none.
 */
export function getSubtle(): SubtleCrypto {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) {
    throw new IapConfigError(
      "IAP_WEBCRYPTO_UNAVAILABLE",
      "Apple purchase verification requires WebCrypto (globalThis.crypto.subtle), " +
        "which this runtime does not provide. It is available in Deno, in Node 18 " +
        "and later, and in browsers over HTTPS. Verification runs in a backend " +
        "function, so this usually means the code is running somewhere unintended."
    );
  }
  return subtle;
}

/**
 * `fetch`, for App Store Server API calls.
 *
 * @throws {IapConfigError} `IAP_FETCH_UNAVAILABLE` when the runtime has none.
 */
export function getFetch(): typeof fetch {
  const impl = (globalThis as { fetch?: typeof fetch }).fetch;
  if (!impl) {
    throw new IapConfigError(
      "IAP_FETCH_UNAVAILABLE",
      "App Store Server API calls require fetch, which this runtime does not " +
        "provide. It is available in Deno, in Node 18 and later, and in browsers."
    );
  }
  // Bound to `globalThis` because an unbound `fetch` throws an illegal-invocation
  // error in some runtimes.
  return impl.bind(globalThis);
}

const encoder = /* @__PURE__ */ (() => {
  try {
    return new TextEncoder();
  } catch {
    return undefined;
  }
})();

/** Encodes a string as UTF-8 bytes. */
export function utf8(input: string): Uint8Array {
  if (!encoder) {
    throw new IapConfigError(
      "IAP_WEBCRYPTO_UNAVAILABLE",
      "TextEncoder is not available in this runtime."
    );
  }
  return encoder.encode(input);
}
