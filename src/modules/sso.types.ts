import { AxiosResponse } from "axios";

/**
 * Response from SSO access token endpoint.
 */
export interface SsoAccessTokenResponse {
  access_token: string;
}

/**
 * SSO (Single Sign-On) module for managing SSO authentication.
 *
 * This module provides methods for retrieving SSO access tokens for users.
 * These tokens allow you to authenticate your Base44 users with external
 * systems or services.
 *
 * This module is only available with service role authentication.
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
   * @returns Promise resolving to an Axios response containing the access token.
   *
   * @example
   * ```typescript
   * // Get SSO access token for a user
   * const response = await base44.asServiceRole.sso.getAccessToken('user_123');
   * console.log(response.data.access_token);
   * ```
   */
  getAccessToken(
    userid: string
  ): Promise<AxiosResponse<SsoAccessTokenResponse>>;
}
