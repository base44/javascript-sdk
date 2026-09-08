import type { Base44Client, CreateClientOptions } from "./client.types.js";
import type { BuilderSession } from "./modules/builder.types.js";
import type { PlatformsModule } from "./modules/platforms.types.js";

/**
 * Configuration for creating a Base44 platform client.
 */
export interface CreatePlatformClientConfig {
  /**
   * The workspace API key used to vend tokens, holding the `user_tokens:mint` scope.
   *
   * This is the hot-path key: it is presented on every request that needs to act
   * as one of your users. A mint-only key can vend tokens for principals that
   * already exist but cannot *create* one, which is what stops it from being an
   * impersonate-anyone primitive if it leaks.
   */
  mintKey: string;
  /**
   * The workspace API key used to create and remove principals, holding the
   * `service_users:provision` scope.
   *
   * Keep it separate from `mintKey`, and keep it off any code path a request can
   * reach. That separation is what makes deprovisioning stick: with a
   * provision-capable key on the hot path, a removed user can be re-provisioned
   * by the next request that mentions them, quietly undoing the offboarding.
   *
   * @defaultValue `mintKey`, for a single-key deployment. Workable, but weaker
   * for the reason above.
   */
  provisionKey?: string;
  /**
   * The Base44 server URL.
   *
   * @defaultValue `"https://base44.app"`
   */
  serverUrl?: string;
  /**
   * Additional client options.
   */
  options?: CreateClientOptions;
}

/**
 * A view of Base44 that acts as one of your users.
 *
 * Obtained from {@link PlatformClient.asPrincipal | asPrincipal()}. Holding one
 * costs nothing — no token is vended until you ask for something.
 */
export interface PrincipalClient {
  /** The identifier this principal was provisioned under. */
  readonly externalId: string;

  /**
   * The builder session for one app, driven as this principal.
   *
   * This is the partner-facing builder: send a message, answer what the agent
   * asks, stop a turn, and watch the whole thing happen over one resumable
   * stream. Every write returns as soon as the turn is *accepted*, because a
   * build takes minutes and no caller should hold a request open through one.
   *
   * The principal must be able to edit the app, which it is when it built the
   * app itself. A workspace that is not enrolled as a platform gets 404 from
   * every route here — deliberately indistinguishable from "no such app", so an
   * unenrolled caller cannot tell the surface exists.
   *
   * Cheap to call: the session is a handle, not a connection, and it holds no
   * credential of its own — the principal's token is re-read per request, so one
   * held across a long build keeps working as the token rotates underneath it.
   *
   * @param appId - The app to build.
   * @returns The session, ready to read and write.
   *
   * @example
   * ```typescript
   * const builder = base44.asPrincipal('user_42').builder(appId);
   *
   * const { turnId } = await builder.sendMessage('add a footer');
   * const outcome = await builder.waitForTurn(turnId);
   *
   * // The browser gets a read-only grant, and nothing else.
   * const grant = await builder.createGrant({ ttlSeconds: 900 });
   * ```
   */
  builder(appId: string): BuilderSession;

  /**
   * A Base44 client for one app, acting as this principal.
   *
   * This is the bridge to the rest of the SDK: the returned client is an ordinary
   * {@link Base44Client}, so `entities`, `agents`, `functions` and the rest work
   * exactly as documented — scoped to what this principal may see, which is
   * usually far less than a service role.
   *
   * Cheap to call repeatedly. The token behind it is cached and renewed for you,
   * and the same app gets the same client back, so a long-lived worker can hold
   * one and a serverless handler can ask for one per request.
   *
   * @param appId - The app to act on.
   * @returns A client scoped to that app, authenticated as this principal.
   *
   * @example
   * ```typescript
   * const asDana = base44.asPrincipal('user_42');
   * const app = await asDana.forApp(appId);
   *
   * // Every module, with Dana's permissions rather than the workspace's.
   * const todos = await app.entities.Todo.list();
   * ```
   */
  forApp(appId: string): Promise<Base44Client>;

  /**
   * The raw access token for this principal, minting or renewing as needed.
   *
   * Most code should use {@link PrincipalClient.forApp | forApp()} or
   * {@link PrincipalClient.builder | builder()} instead. Reach for this when you need
   * to authenticate a request the SDK does not make for you.
   *
   * **Not the thing to send to a browser.** This token can start builds and spend
   * your credits. What a browser gets is a grant from
   * {@link BuilderSession.createGrant | createGrant()}, which reads one session and
   * writes nothing.
   *
   * Do not cache what this returns — it is already cached, and holding a copy is
   * how a caller ends up using a token the store has since replaced.
   *
   * @returns A currently-valid access token.
   *
   * @throws {Base44Error} 404 if no principal matches, which is what an
   * un-provisioned `externalId` looks like: minting never creates one.
   */
  getToken(): Promise<string>;

  /**
   * Forgets this principal's cached token and revokes its refresh token.
   *
   * Use when a user signs out of *your* platform. It does not remove the
   * principal — the apps it built belong to it, and signing out should not hand
   * them to the workspace owner. Removing it is
   * {@link PlatformsModule.deprovisionPrincipal | deprovisionPrincipal()}.
   *
   * Only the refresh token can be revoked; a live access token remains valid for
   * the rest of its hour. Deprovisioning is the lever that cuts one off
   * immediately.
   */
  revokeToken(): Promise<void>;
}

/**
 * A workspace-scoped Base44 client, for platforms that build apps on behalf of
 * their own users.
 *
 * The third client factory, beside {@link createClient | createClient()} (one
 * app, one user) and {@link createClientFromRequest | createClientFromRequest()}
 * (inside a Base44 function). This one is scoped to a *workspace*: it manages the
 * identities your users act as, and hands you a client per identity.
 */
export interface PlatformClient {
  /** {@link PlatformsModule | Platforms module} for managing service principals. */
  platforms: PlatformsModule;

  /**
   * Acts as one of your users.
   *
   * Mirrors `base44.asServiceRole` in shape — the same SDK, different
   * permissions — but parameterised, because a platform has many identities
   * rather than one privileged one.
   *
   * The principal must already exist;
   * {@link PlatformsModule.provisionPrincipal | provisionPrincipal()} is
   * idempotent and safe to call first on every request.
   *
   * @param externalId - The identifier the principal was provisioned under.
   * @returns A view of Base44 that acts as that principal.
   *
   * @example
   * ```typescript
   * await base44.platforms.provisionPrincipal({ externalId: 'user_42' });
   * const asDana = base44.asPrincipal('user_42');
   * ```
   */
  asPrincipal(externalId: string): PrincipalClient;

  /**
   * Gets the current client configuration.
   * @internal
   */
  getConfig(): { serverUrl: string };
}
