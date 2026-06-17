export const isNode = typeof window === "undefined";
export const isInIFrame = !isNode && window.self !== window.top;

// Multi-tenancy: the active account is explicit client state, not the URL path.
// It is persisted in localStorage keyed per app (`base44:active_account:<appId>`)
// so it survives reloads and works under any base path (e.g. the sandbox/preview
// where the app is served under a non-account base path). When unset, no header
// is sent and the backend defaults to the user's sole active account.
const ACCOUNT_ID_RE = /^[a-f0-9]{24}$/;

const activeAccountStorageKey = (appId: string): string =>
  `base44:active_account:${appId}`;

/**
 * The active account id from stored client state, or undefined.
 *
 * Browser-only: reads `localStorage['base44:active_account:<appId>']` and returns
 * it when it's a valid 24-hex account id, else undefined. Returns undefined in
 * non-browser environments or if storage access throws.
 */
export function getStoredActiveAccountId(appId: string): string | undefined {
  if (isNode) return undefined;
  try {
    const stored = window.localStorage.getItem(activeAccountStorageKey(appId));
    return stored && ACCOUNT_ID_RE.test(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Persist (or clear) the active account id in stored client state.
 *
 * Browser-only: writes `localStorage['base44:active_account:<appId>']` when
 * `accountId` is a valid 24-hex id, and removes the key when it is null or
 * invalid. No-op in non-browser environments or if storage access throws.
 */
export function setStoredActiveAccountId(
  appId: string,
  accountId: string | null
): void {
  if (isNode) return;
  try {
    const key = activeAccountStorageKey(appId);
    if (accountId && ACCOUNT_ID_RE.test(accountId)) {
      window.localStorage.setItem(key, accountId);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable — ignore */
  }
}

export const generateUuid = () => {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
};
