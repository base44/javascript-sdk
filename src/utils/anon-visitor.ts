import { v4 as uuidv4 } from "uuid";

/**
 * localStorage key holding the anonymous visitor id.
 * @internal
 */
const ANONYMOUS_VISITOR_ID_STORAGE_KEY = "base44_anonymous_visitor_id";

/**
 * Returns a stable per-browser identifier for an unauthenticated ("anonymous")
 * visitor, creating and persisting one on first use.
 *
 * Sent as the `X-Base44-Anonymous-Id` header on unauthenticated requests so the
 * backend can group an anonymous user's agent conversations and enforce
 * ownership (the header is treated as a bearer-style credential). Persisted in
 * localStorage so it survives reloads; a new browser/device or cleared storage
 * starts a fresh anonymous identity.
 *
 * Returns `null` outside the browser (no `localStorage` / SSR) so callers can
 * skip the header on the server.
 *
 * @internal
 */
export function getOrCreateAnonymousVisitorId(): string | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    const existing = window.localStorage.getItem(
      ANONYMOUS_VISITOR_ID_STORAGE_KEY
    );
    if (existing) {
      return existing;
    }
    const minted = uuidv4();
    window.localStorage.setItem(ANONYMOUS_VISITOR_ID_STORAGE_KEY, minted);
    return minted;
  } catch {
    // localStorage unavailable (private mode / sandboxed iframe): no stable id.
    return null;
  }
}
