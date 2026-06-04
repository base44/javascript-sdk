export const isNode = typeof window === "undefined";
export const isInIFrame = !isNode && window.self !== window.top;

// Multi-tenancy: apps are served under `/<account_id>/<route>` where the first
// path segment is a 24-hex Mongo ObjectId. Read it at request time so the active
// account is always current — even after client-side (Link/useNavigate) account
// switches that don't reload the module.
const ACCOUNT_ID_RE = /^[a-f0-9]{24}$/;

/**
 * The active account id from the URL, or undefined.
 *
 * In the sandbox/preview the app is served under `/<appId>/` (the dev-server base
 * path), so the first segment is the app id — its own base, NOT an account. When
 * `appId` is supplied and matches the leading segment, it's skipped so the app id
 * is never sent as an account id; the account, if any, is the next segment.
 */
export function getActiveAccountIdFromPath(appId?: string): string | undefined {
  if (isNode) return undefined;
  const segments = window.location.pathname.split("/").filter(Boolean);
  const candidate = appId && segments[0] === appId ? segments[1] : segments[0];
  return candidate && ACCOUNT_ID_RE.test(candidate) ? candidate : undefined;
}

export const generateUuid = () => {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
};
