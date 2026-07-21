/**
 * Response from SSO access token endpoint.
 * @internal
 */
export interface SsoAccessTokenResponse {
  access_token: string;
}

/**
 * SSO (Single Sign-On) module for managing SSO authentication.
 *
 * This module provides methods for retrieving SSO tokens for users. These
 * tokens allow you to authenticate Base44 users with external systems or
 * services.
 *
 * This module is only available to use with a client in service role authentication mode, which means it can only be used in backend environments.
 *
 * @internal
 *
 * @example
 * ```typescript
 * // Access SSO module with service role
 * const response = await base44.asServiceRole.sso.getAccessToken('user_123');
 * console.log(response.data.access_token);
 * ```
 */
export interface SsoModule {
  /**
   * Gets SSO access token for a specific user.
   *
   * Retrieves a Single Sign-On access token that can be used to authenticate
   * a user with external services or systems.
   *
   * @param userid - The user ID to get the access token for.
   * @returns Promise resolving to the SSO access token response.
   *
   * @example
   * ```typescript
   * // Get SSO access token for a user
   * const response = await base44.asServiceRole.sso.getAccessToken('user_123');
   * console.log(response.access_token);
   * ```
   */
  getAccessToken(userid: string): Promise<SsoAccessTokenResponse>;

  /**
   * Gets the stored SSO OIDC ID token for the current app user.
   *
   * The service-role client must include an on-behalf-of token for the same
   * user specified by `userid`. This method returns the stored token as-is and
   * does not refresh it.
   *
   * @param userid - The current app user's ID.
   * @returns Promise resolving to the raw ID-token string.
   *
   * @example
   * ```typescript
   * import { createClientFromRequest } from 'npm:@base44/sdk';
   *
   * Deno.serve(async (req) => {
   *   const base44 = createClientFromRequest(req);
   *   const user = await base44.auth.me();
   *   const idToken = await base44.asServiceRole.sso.getIdToken(user.id);
   *
   *   return Response.json({ idToken });
   * });
   * ```
   */
  getIdToken(userid: string): Promise<string>;
}
