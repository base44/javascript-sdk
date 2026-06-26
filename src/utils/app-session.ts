import { AxiosInstance } from "axios";
import { getTurnstileToken } from "./turnstile.js";

/**
 * App-session token provider (BUG-438).
 *
 * Public apps (`public_without_login`) expose Core integration endpoints to
 * anonymous callers by design — the app's own browser frontend invokes them
 * with no logged-in user. To distinguish "request from the served app" from
 * "arbitrary request against the public endpoint", the backend mints a
 * short-lived, app-bound session token and the SDK replays it on Core calls via
 * the `X-Base44-App-Session` header.
 *
 * Minting is a two-step challenge-response so a plain script can't just fetch a
 * token:
 *   1. GET  /apps/{appId}/integration-session  → whether a Turnstile challenge
 *      is required and, if so, the public site key to render it with.
 *   2. POST /apps/{appId}/integration-session  → the session token, after the
 *      Turnstile response token (when required) is attached.
 *
 * Best-effort throughout: if minting (or the challenge) fails the provider
 * returns `null` and the integration call proceeds without the header. The
 * backend runs observe-only until per-app enforcement is enabled, so missing
 * tokens never break legitimate traffic during rollout.
 */
export const APP_SESSION_HEADER = "X-Base44-App-Session";
export const TURNSTILE_RESPONSE_HEADER = "Cf-Turnstile-Response";

// Refresh slightly before expiry so an in-flight call never races the TTL.
const EXPIRY_MARGIN_SECONDS = 60;

interface ChallengeResponse {
  turnstile_required?: boolean;
  turnstile_site_key?: string | null;
}

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
  const sessionPath = `/apps/${appId}/integration-session`;

  async function fetchToken(): Promise<string | null> {
    try {
      // The integrations axios client unwraps responses to the body directly.
      const challenge = (await axios.get(
        sessionPath
      )) as unknown as ChallengeResponse;

      const headers: Record<string, string> = {};
      if (challenge?.turnstile_required && challenge.turnstile_site_key) {
        const turnstileToken = await getTurnstileToken(
          challenge.turnstile_site_key
        );
        // If the challenge couldn't be solved, POST anyway: the backend will
        // reject when enforcing (observe-only otherwise), and we fail soft.
        if (turnstileToken) {
          headers[TURNSTILE_RESPONSE_HEADER] = turnstileToken;
        }
      }

      const res = (await axios.post(
        sessionPath,
        {},
        { headers }
      )) as unknown as SessionResponse;
      if (res && typeof res.session_token === "string") {
        token = res.session_token;
        const ttl = typeof res.expires_in === "number" ? res.expires_in : 0;
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
