import { AxiosInstance } from "axios";

/**
 * App-session token provider (BUG-438).
 *
 * Public apps (`public_without_login`) expose Core integration endpoints to
 * anonymous callers by design — the app's own browser frontend invokes them
 * with no logged-in user. To distinguish "request from the served app" from
 * "arbitrary request against the public endpoint", the backend mints a
 * short-lived, app-bound session token at app boot. The SDK fetches it lazily
 * and replays it on Core integration calls via the `X-Base44-App-Session`
 * header.
 *
 * This is intentionally best-effort: if minting fails the provider returns
 * `null` and the integration call proceeds without the header. The backend
 * runs in observe-only mode until per-app enforcement is enabled, so missing
 * tokens never break legitimate traffic during rollout.
 */
export const APP_SESSION_HEADER = "X-Base44-App-Session";

// Refresh slightly before expiry so an in-flight call never races the TTL.
const EXPIRY_MARGIN_SECONDS = 60;

interface SessionResponse {
  session_token?: string;
  expires_in?: number;
}

export interface AppSessionProvider {
  /** Returns a valid token, refreshing if needed. Never throws; null on failure. */
  getToken(): Promise<string | null>;
}

export function createAppSessionProvider(
  axios: AxiosInstance,
  appId: string
): AppSessionProvider {
  let token: string | null = null;
  let expiresAtMs = 0;
  let inFlight: Promise<string | null> | null = null;

  const nowMs = () => Date.now();
  const isFresh = () => token !== null && nowMs() < expiresAtMs;

  async function fetchToken(): Promise<string | null> {
    try {
      // The integrations axios client unwraps responses to the body directly.
      const res = (await axios.get(
        `/apps/${appId}/integration-session`
      )) as unknown as SessionResponse;
      if (res && typeof res.session_token === "string") {
        token = res.session_token;
        const ttl =
          typeof res.expires_in === "number" ? res.expires_in : 0;
        expiresAtMs = nowMs() + Math.max(0, ttl - EXPIRY_MARGIN_SECONDS) * 1000;
        return token;
      }
    } catch {
      /* best-effort: fall through and return null */
    }
    token = null;
    expiresAtMs = 0;
    return null;
  }

  return {
    async getToken() {
      if (isFresh()) {
        return token;
      }
      // De-dupe concurrent refreshes (e.g. a burst of integration calls on load).
      if (!inFlight) {
        inFlight = fetchToken().finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
  };
}
