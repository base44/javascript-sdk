import type { AxiosInstance } from "axios";

/**
 * The OAuth client id every service-principal token is issued under.
 *
 * Deliberately not one of Base44's MCP client prefixes — a token whose client id
 * starts with one of those is rejected everywhere except `/mcp`.
 */
export const SERVICE_CLIENT_ID = "svc_delegate";

/**
 * Re-mint this long before a token's stated expiry.
 *
 * Access tokens are vended with an explicit one-hour lifetime, so this is a few
 * percent of the token's life — enough that a slow call cannot land after the
 * token it was authorized with has expired.
 */
export const REFRESH_SKEW_MS = 5 * 60 * 1000;

/** A vended access token and what is needed to renew it. */
export interface VendedToken {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds at which the access token stops being accepted. */
  expiresAt: number;
}

/** The wire shape of an OAuth 2.0 token response. */
interface OAuth2TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in: number;
  scope?: string;
  refresh_token?: string | null;
}

interface TokenStoreConfig {
  /** Carries the `user_tokens:mint` key. Used for minting and nothing else. */
  mintAxios: AxiosInstance;
  /**
   * Carries no credential at all.
   *
   * `/oauth/token` and `/oauth/revoke` authenticate the *refresh token*, not the
   * caller, so presenting a workspace key there would be sending a
   * long-lived secret somewhere it is neither wanted nor checked.
   */
  oauthAxios: AxiosInstance;
  refreshSkewMs?: number;
}

/**
 * Caches one vended token per principal, and renews it before it lapses.
 *
 * Caching is not an optimization here. Minting is rate-limited **per workspace**,
 * so a platform that mints on every request spends one shared budget on behalf of
 * every user at once and starts failing under exactly the load it was built for.
 * A vended token is good for an hour; this holds it for that hour.
 *
 * @internal
 */
export function createPrincipalTokenStore({
  mintAxios,
  oauthAxios,
  refreshSkewMs = REFRESH_SKEW_MS,
}: TokenStoreConfig) {
  const cache = new Map<string, VendedToken>();
  // One entry per principal currently being fetched. Without this, N concurrent
  // requests for a user whose token just lapsed each fire their own mint — a
  // self-inflicted burst against the very limit the cache exists to respect.
  const inFlight = new Map<string, Promise<VendedToken>>();

  const toVended = (response: OAuth2TokenResponse): VendedToken => {
    const lifetimeMs = Math.max(Number(response.expires_in) || 0, 0) * 1000;
    // Never let the skew consume the whole lifetime: a token considered stale on
    // arrival would mint again on the next call, and again, turning the cache
    // into a mint-per-request loop against a shared budget.
    const skew = Math.min(refreshSkewMs, lifetimeMs / 2);
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token ?? undefined,
      expiresAt: Date.now() + lifetimeMs - skew,
    };
  };

  const mint = async (externalId: string): Promise<VendedToken> => {
    const response: OAuth2TokenResponse = await mintAxios.post(
      "/api/service/user-tokens",
      { service_external_id: externalId }
    );
    return toVended(response);
  };

  const renew = async (refreshToken: string): Promise<VendedToken> => {
    const response: OAuth2TokenResponse = await oauthAxios.post(
      "/oauth/token",
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: SERVICE_CLIENT_ID,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    return toVended(response);
  };

  const fetchToken = async (externalId: string): Promise<VendedToken> => {
    const held = cache.get(externalId);
    if (held?.refreshToken) {
      try {
        return await renew(held.refreshToken);
      } catch {
        // A refresh token can be revoked, expired, or invalidated by a role
        // change. Minting is the recovery, and it re-checks everything the
        // refresh would have — so falling through is not a way around a
        // revocation, it just costs one extra round trip.
      }
    }
    return mint(externalId);
  };

  return {
    /**
     * A currently-valid token for the principal, minting or renewing only when
     * the held one is spent.
     */
    async get(externalId: string): Promise<VendedToken> {
      const held = cache.get(externalId);
      if (held && held.expiresAt > Date.now()) return held;

      const pending = inFlight.get(externalId);
      if (pending) return pending;

      const request = fetchToken(externalId)
        .then((token) => {
          cache.set(externalId, token);
          return token;
        })
        .finally(() => {
          inFlight.delete(externalId);
        });

      inFlight.set(externalId, request);
      return request;
    },

    /**
     * Drops the held token and asks Base44 to revoke its refresh token.
     *
     * Only the refresh half is revocable — the access token is self-contained and
     * stays valid until it expires. To cut a principal off *now*, deprovision it:
     * the workspace membership is re-checked on every request.
     */
    async revoke(externalId: string): Promise<void> {
      const held = cache.get(externalId);
      cache.delete(externalId);
      if (!held?.refreshToken) return;
      // Best effort: a failed revoke must not leave a caller unable to forget a
      // principal locally.
      try {
        await oauthAxios.post(
          "/oauth/revoke",
          new URLSearchParams({
            token: held.refreshToken,
            client_id: SERVICE_CLIENT_ID,
          }),
          { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );
      } catch {
        /* the local record is already gone, which is the part that matters */
      }
    },
  };
}

/** @internal */
export type PrincipalTokenStore = ReturnType<typeof createPrincipalTokenStore>;
