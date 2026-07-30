/**
 * PKCE-bound one-time session-code handoff for SSO logins
 * (base44-dev/apper#17216 §5.2).
 *
 * The SDK OFFERS the handoff at login kickoff (`version=2` + S256
 * `code_challenge`) and the backend DECIDES per request: it only emits a
 * `session_code` when every server-side gate holds (verified custom domain,
 * non-private app, feature flag ON). In every other case — older backends,
 * excluded apps, and critically a BACKEND ROLLBACK — the server keeps
 * delivering the legacy `?access_token=` URL param, which the SDK digests
 * exactly as before. This is a negotiation, never a deprecation: the legacy
 * path must keep working here forever.
 *
 * Fail-open rule for kickoff: never send `version=2` unless this browser can
 * actually complete the exchange (WebCrypto, sessionStorage that persists,
 * fetch). The server 400s a `version=2` login without a valid challenge, and
 * an opted-in login whose verifier is lost can never redeem its code — both
 * are avoided by simply not opting in and letting the legacy path run.
 */

/** sessionStorage key for the PKCE verifier. Per-tab by design (RFC 7636: the
 * verifier never leaves the browser); a login that completes in a different
 * tab loses it — a named, expected failure mode, see redeemSessionHandoffCode. */
export const PKCE_VERIFIER_STORAGE_KEY = "base44_pkce_verifier";

/** Server-side format for challenge/verifier: base64url of 32 bytes, 43 chars. */
const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Prepares the PKCE opt-in for an SSO login kickoff.
 *
 * Generates a verifier, persists it in sessionStorage (verified by read-back —
 * a write that doesn't stick means the exchange could never succeed), and
 * returns the query-string suffix to append to the login URL:
 * `&version=2&code_challenge=<S256>&code_challenge_method=S256`.
 *
 * Returns `null` on ANY failure or missing capability, in which case the
 * caller must use the unmodified legacy login URL. Never throws.
 *
 * @internal
 */
export async function prepareSessionHandoffKickoff(): Promise<string | null> {
  try {
    if (typeof window === "undefined") return null;

    const crypto = globalThis.crypto;
    if (!crypto?.getRandomValues || !crypto.subtle?.digest) return null;
    // The exchange at redemption time needs fetch; don't opt in without it.
    if (typeof fetch !== "function") return null;

    const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));

    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(verifier)
    );
    const challenge = base64UrlEncode(new Uint8Array(digest));
    // The server rejects a malformed opt-in with a 400 at /login; a malformed
    // challenge here must therefore mean "don't opt in", never "send anyway".
    if (!BASE64URL_43.test(challenge)) return null;

    // Store last, after everything else succeeded, and verify the write took
    // (sandboxed iframes and lockdown modes can throw OR silently drop it).
    window.sessionStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, verifier);
    if (window.sessionStorage.getItem(PKCE_VERIFIER_STORAGE_KEY) !== verifier) {
      return null;
    }

    return `&version=2&code_challenge=${challenge}&code_challenge_method=S256`;
  } catch {
    return null;
  }
}

/**
 * Redeems a PKCE session-code handoff from the current URL, if one is present.
 *
 * Returns `null` synchronously when the URL carries no handoff — including
 * when it carries a legacy `?access_token=` (the legacy capture wins outright;
 * this is what makes a backend rollback safe). Otherwise strips the handoff
 * params from the URL immediately and returns a promise resolving to the
 * exchanged access token, or `null` when the exchange fails. Never rejects,
 * never redirects: a failed exchange leaves the app unauthenticated and lets
 * its normal login flow take over (each retry mints a fresh code, so this
 * self-heals rather than looping).
 *
 * @internal
 */
export function redeemSessionHandoffCode(): Promise<string | null> | null {
  if (typeof window === "undefined" || !window.location) return null;

  let code: string | null = null;
  let exchangePath: string | null = null;
  let urlParams: URLSearchParams;
  try {
    urlParams = new URLSearchParams(window.location.search);
    code = urlParams.get("session_code");
    exchangePath = urlParams.get("session_exchange_path");
    if (!code || !exchangePath) return null;
    // A server speaking legacy is authoritative: if an access_token is in the
    // URL (the two are never both sent by a real backend), take the legacy
    // path and ignore the code entirely.
    if (urlParams.get("access_token")) return null;

    // Strip the one-time params right away so the code doesn't linger in the
    // URL/history or get re-submitted on reload. `is_new_user` stays in the
    // URL exactly as the legacy flow leaves it.
    urlParams.delete("session_code");
    urlParams.delete("session_exchange_path");
    const newUrl = `${window.location.pathname}${
      urlParams.toString() ? `?${urlParams.toString()}` : ""
    }${window.location.hash}`;
    window.history.replaceState(
      {},
      typeof document !== "undefined" ? document.title : "",
      newUrl
    );
  } catch (e) {
    console.error("Error reading session handoff params from URL:", e);
    return null;
  }

  return exchangeSessionHandoffCode(code, exchangePath);
}

async function exchangeSessionHandoffCode(
  code: string,
  exchangePath: string
): Promise<string | null> {
  // The verifier is one-shot: take it out of storage no matter how the
  // exchange ends (a failed PKCE check doesn't burn the code server-side,
  // but a stale verifier can never match a future login's challenge).
  let verifier: string | null = null;
  try {
    verifier = window.sessionStorage.getItem(PKCE_VERIFIER_STORAGE_KEY);
    if (verifier !== null) {
      window.sessionStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY);
    }
  } catch {
    verifier = null;
  }

  // SECURITY: the exchange path arrives via the URL, so treat it as tainted.
  // POSTing the code + verifier to an attacker-chosen origin would hand over
  // both halves of the PKCE proof — enforce same-origin, path-only semantics.
  let exchangeUrl: URL;
  try {
    exchangeUrl = new URL(exchangePath, window.location.origin);
  } catch {
    console.error("Invalid session_exchange_path; skipping token exchange.");
    return null;
  }
  if (exchangeUrl.origin !== window.location.origin) {
    console.error(
      "Cross-origin session_exchange_path rejected; skipping token exchange."
    );
    return null;
  }

  if (typeof fetch !== "function") return null;

  try {
    const response = await fetch(exchangeUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        ...(verifier ? { code_verifier: verifier } : {}),
      }),
    });

    if (!response.ok) {
      if (!verifier) {
        // Named failure mode (base44-dev/apper#17216): the login completed in
        // a different tab/window than it started in, so the per-tab PKCE
        // verifier is gone and the server fails closed. Logging in again from
        // this tab works.
        console.warn(
          "Base44 SDK: SSO login could not be completed because it finished " +
            "in a different browser tab than it started in (missing PKCE " +
            "verifier). Please log in again."
        );
      } else {
        console.error(
          `Base44 SDK: SSO session-code exchange failed (HTTP ${response.status}).`
        );
      }
      return null;
    }

    const data = await response.json();
    const accessToken = data?.access_token;
    return typeof accessToken === "string" && accessToken ? accessToken : null;
  } catch (e) {
    console.error("Base44 SDK: SSO session-code exchange failed:", e);
    return null;
  }
}
