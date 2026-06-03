export const isNode = typeof window === "undefined";
export const isInIFrame = !isNode && window.self !== window.top;

// Multi-tenancy: apps are served under `/<account_id>/<route>` where the first
// path segment is a 24-hex Mongo ObjectId. Read it at request time so the active
// account is always current — even after client-side (Link/useNavigate) account
// switches that don't reload the module.
const ACCOUNT_ID_RE = /^[a-f0-9]{24}$/;

export function getActiveAccountIdFromPath(): string | undefined {
  if (isNode) return undefined;
  const firstSegment = window.location.pathname.split("/").filter(Boolean)[0];
  return firstSegment && ACCOUNT_ID_RE.test(firstSegment)
    ? firstSegment
    : undefined;
}

export const generateUuid = () => {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
};
