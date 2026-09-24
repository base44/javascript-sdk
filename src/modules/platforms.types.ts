/**
 * The role a service principal holds in the workspace.
 *
 * Capped on the server: a principal is never an owner or an admin, whatever a
 * caller asks for. Passing anything outside this set is clamped down rather than
 * rejected, so a typo cannot quietly grant more than intended.
 */
export type PrincipalRole = "editor" | "viewer";

/**
 * Parameters for provisioning a service principal.
 */
export interface ProvisionPrincipalParams {
  /**
   * Your own identifier for the person this principal acts for — whatever your
   * platform already calls them (`"user_42"`, a UUID, a tenant-scoped handle).
   *
   * It is opaque to Base44 and is the only thing that addresses this principal
   * afterwards, so it must be stable for the life of the account. Never an
   * email, and never an SSO identity.
   */
  externalId: string;
  /**
   * A human-readable name, shown wherever the principal appears in Base44.
   *
   * Cosmetic only: nothing resolves a principal by name.
   */
  displayName?: string;
  /**
   * The workspace role to create the principal with.
   *
   * @defaultValue `"editor"`
   */
  role?: PrincipalRole;
}

/**
 * A provisioned service principal.
 */
export interface ServicePrincipal {
  /** The identifier you provisioned it under. */
  externalId: string;
  /** Base44's own user id for the principal. */
  userId: string;
  /**
   * The synthetic address Base44 generated for it.
   *
   * In a reserved, non-routable domain that can never receive mail — a
   * principal is a robot identity, not a person with an inbox.
   */
  email: string;
  /** The role it actually holds, after the server's ceiling is applied. */
  role: string;
  /**
   * Whether this call created the principal.
   *
   * `false` means it already existed and was returned unchanged. Provisioning is
   * idempotent, so this is informational — not an error to handle.
   */
  created: boolean;
}

/**
 * The outcome of deprovisioning a principal.
 */
export interface DeprovisionResult {
  /** The identifier that was addressed. */
  externalId: string;
  /**
   * Whether this call actually tore a principal down.
   *
   * `false` means nothing matched. Repeating a deprovision is safe and still
   * succeeds, so a `false` on the *first* call is the interesting one: it means
   * the id is wrong and some live principal is still holding vended tokens.
   */
  removed: boolean;
}

/**
 * Platform-level operations, scoped to a workspace rather than to one app.
 *
 * Reached through {@link createPlatformClient | createPlatformClient()}, which is
 * the only client that holds workspace keys. This module manages *who* your
 * platform acts as; {@link PlatformClient.asPrincipal | asPrincipal()} is how you
 * then act as one.
 */
export interface PlatformsModule {
  /**
   * Creates a service principal for one of your users, or returns the existing one.
   *
   * Idempotent per `(workspace, externalId)`, so the intended use is to call it
   * on every request that needs a principal rather than tracking which of your
   * users you have provisioned. The second call is a plain lookup.
   *
   * The principal is created with **no credential of its own** — nothing can log
   * in as it. The only way to act as it is
   * {@link PlatformClient.asPrincipal | asPrincipal()}, which needs your
   * workspace's mint key.
   *
   * Requires the `service_users:provision` key.
   *
   * @param params - The principal to provision.
   * @returns The principal, whether it was just created or already existed.
   *
   * @throws {Base44Error} 409 if the generated address collides with an existing
   * account, 403 if service principals are not enabled for the workspace.
   *
   * @example
   * ```typescript
   * // Safe to call on every request — the second call is just a lookup.
   * const principal = await base44.platforms.provisionPrincipal({
   *   externalId: 'user_42',
   *   displayName: 'Dana',
   * });
   *
   * const asDana = base44.asPrincipal('user_42');
   * ```
   */
  provisionPrincipal(params: ProvisionPrincipalParams): Promise<ServicePrincipal>;

  /**
   * Removes a service principal from the workspace.
   *
   * This is the offboarding lever, and it bites immediately: every vended token
   * re-checks the workspace membership on each request, so tokens already handed
   * out stop working now rather than when they expire.
   *
   * Requires the `service_users:provision` key — which is why that key should not
   * be reachable from a request path.
   *
   * Deprovisioning does not delete the apps the principal built; it owns them,
   * and they outlive it.
   *
   * @param externalId - The identifier the principal was provisioned under.
   * @returns Whether a principal was actually torn down.
   *
   * @example
   * ```typescript
   * // A user closed their account.
   * await base44.platforms.deprovisionPrincipal('user_42');
   * ```
   */
  deprovisionPrincipal(externalId: string): Promise<DeprovisionResult>;
}
