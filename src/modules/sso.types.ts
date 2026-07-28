/**
 * Response from SSO access token endpoint.
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
 */
export interface SsoModule {
  /**
   * Gets an SSO access token for the user who made the current request.
   *
   * Use this token to authenticate the user with external systems or services.
   * This only works for that same user. Create the client with
   * {@link createClientFromRequest} so it acts on behalf of the request's user,
   * then pass that user's ID as `userid`. If `userid` is any other user, the
   * call fails. An expired token is refreshed automatically when a refresh token
   * is available.
   *
   * @param userid - The ID of the user who made the current request, such as the
   * `id` returned by {@link AuthModule | base44.auth.me()}.
   * @returns Promise resolving to the SSO access token response.
   *
   * @example
   * ```typescript
   * // Get the user's SSO access token to call an external system
   * import { createClientFromRequest } from 'npm:@base44/sdk';
   *
   * Deno.serve(async (req) => {
   *   const base44 = createClientFromRequest(req);
   *   const user = await base44.auth.me();
   *   const { access_token } = await base44.asServiceRole.sso.getAccessToken(user.id);
   *
   *   return Response.json({ access_token });
   * });
   * ```
   */
  getAccessToken(userid: string): Promise<SsoAccessTokenResponse>;

  /**
   * Gets the stored SSO OIDC ID token for the user who made the current request.
   *
   * This only works for that same user, not for arbitrary users. Create the
   * client with {@link createClientFromRequest} so it acts on behalf of the
   * request's user, then pass that user's ID as `userid`. If `userid` is any
   * other user, the call fails. The stored token is returned as-is and is never
   * refreshed, so the call fails if the token has already expired.
   *
   * @param userid - The ID of the user who made the current request, such as the
   * `id` returned by {@link AuthModule | base44.auth.me()}.
   * @returns Promise resolving to the raw ID-token string.
   *
   * @example
   * ```typescript
   * // Get the user's ID token to read identity claims such as email
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
