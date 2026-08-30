import { createAxiosClient } from "./utils/axios-client.js";
import { createPlatformsModule } from "./modules/platforms.js";
import { createPrincipalTokenStore } from "./utils/principal-tokens.js";
import { createClient } from "./client.js";
import type { Base44Client } from "./client.types.js";
import type {
  CreatePlatformClientConfig,
  PlatformClient,
  PrincipalClient,
} from "./platform-client.types.js";

// Re-export platform client types
export type { CreatePlatformClientConfig, PlatformClient, PrincipalClient };

/**
 * Creates a workspace-scoped Base44 client, for platforms that build apps on
 * behalf of their own users.
 *
 * This is the third client factory, and it exists for the one case neither of
 * the others covers. {@linkcode createClient | createClient()} is scoped to one
 * app and one user; {@linkcode createClientFromRequest | createClientFromRequest()}
 * runs inside a Base44-hosted function. A platform is scoped to a **workspace**:
 * it has many users, none of whom have a Base44 account, and it needs each of
 * them to own the apps they build.
 *
 * The model is a *service principal* — a synthetic member of your workspace,
 * created with no credential of its own, that you act as. Your users never see
 * Base44; you keep your own accounts and map each one to a principal.
 *
 * Two steps, and the first is idempotent:
 *
 * 1. {@linkcode PlatformsModule.provisionPrincipal | provisionPrincipal()} to
 *    make sure a principal exists for your user.
 * 2. {@linkcode PlatformClient.asPrincipal | asPrincipal()} to act as them.
 *
 * **Server-side only.** This client holds workspace API keys, which authorize
 * every app in the workspace. Never construct one in a browser, and never send
 * either key to one — a browser gets a short-lived token vended *for it*, which
 * is what {@linkcode PrincipalClient.getToken | getToken()} is for.
 *
 * @param config - Configuration object for the platform client.
 * @returns A configured platform client.
 *
 * @example
 * ```typescript
 * import { createPlatformClient } from '@base44/sdk';
 *
 * const base44 = createPlatformClient({
 *   mintKey: process.env.BASE44_MINT_KEY,          // user_tokens:mint
 *   provisionKey: process.env.BASE44_PROVISION_KEY, // service_users:provision
 * });
 *
 * // On a request from one of your users:
 * await base44.platforms.provisionPrincipal({
 *   externalId: 'user_42',
 *   displayName: 'Dana',
 * });
 *
 * const asDana = base44.asPrincipal('user_42');
 * const app = await asDana.forApp(appId);
 * const todos = await app.entities.Todo.list();
 * ```
 */
export function createPlatformClient(
  config: CreatePlatformClientConfig
): PlatformClient {
  const {
    serverUrl = "https://base44.app",
    mintKey,
    provisionKey = mintKey,
    options,
  } = config;

  // Three clients, because they carry three different credentials — and the
  // separation is the security property, not tidiness. Nothing reachable from a
  // request should be able to create a principal, and nothing at all should
  // present a workspace key to an endpoint that authenticates a refresh token.
  const mintAxios = createAxiosClient({
    baseURL: serverUrl,
    token: mintKey,
    onError: options?.onError,
  });

  const provisionAxios = createAxiosClient({
    baseURL: serverUrl,
    token: provisionKey,
    onError: options?.onError,
  });

  const oauthAxios = createAxiosClient({
    baseURL: serverUrl,
    onError: options?.onError,
  });

  const tokens = createPrincipalTokenStore({ mintAxios, oauthAxios });
  const platforms = createPlatformsModule(provisionAxios);

  // One principal handle per external id, and one app client per (principal,
  // app). Both are addressed by stable ids and both wrap cached state, so
  // rebuilding them per request would throw away the token cache that makes the
  // mint rate limit survivable.
  const principals = new Map<string, PrincipalClient>();

  const buildPrincipal = (externalId: string): PrincipalClient => {
    // The token each client was last given, so a rotation can be detected. Held
    // beside the client rather than read back off it because a client does not
    // expose its credential.
    const apps = new Map<string, { client: Base44Client; token: string }>();

    const getToken = async () => (await tokens.get(externalId)).accessToken;

    return {
      externalId,

      getToken,

      async forApp(appId: string): Promise<Base44Client> {
        const token = await getToken();
        const held = apps.get(appId);
        if (held) {
          // Only on an actual rotation. `setToken` treats the call as an
          // identity change — it discards the in-flight `me()` other callers are
          // awaiting and resets the analytics session — so applying it on every
          // request would undo work the client does on the caller's behalf.
          if (held.token !== token) {
            held.client.setToken(token);
            held.token = token;
          }
          return held.client;
        }
        const client = createClient({ appId, serverUrl, token, options });
        apps.set(appId, { client, token });
        return client;
      },

      async revokeToken() {
        await tokens.revoke(externalId);
        for (const { client } of apps.values()) client.cleanup();
        apps.clear();
      },
    };
  };

  return {
    platforms,

    asPrincipal(externalId: string): PrincipalClient {
      let principal = principals.get(externalId);
      if (!principal) {
        principal = buildPrincipal(externalId);
        principals.set(externalId, principal);
      }
      return principal;
    },

    getConfig() {
      return { serverUrl };
    },
  };
}
