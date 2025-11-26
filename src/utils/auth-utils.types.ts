/**
 * Configuration options for retrieving an access token.
 *
 * @internal
 *
 * @example
 * ```typescript
 * // Get access token from URL or local storage using default options
 * const token = getAccessToken();
 * ```
 *
 * @example
 * ```typescript
 * // Get access token from custom local storage key
 * const token = getAccessToken({ storageKey: 'my_app_token' });
 * ```
 *
 * @example
 * ```typescript
 * // Get token from URL but don't save or remove from URL
 * const token = getAccessToken({
 *   saveToStorage: false,
 *   removeFromUrl: false
 * });
 * ```
 */
export interface GetAccessTokenOptions {
  /**
   * The key to use when storing or retrieving the token in local storage.
   * @default 'base44_access_token'
   */
  storageKey?: string;

  /**
   * The URL parameter name to check for the access token.
   * @default 'access_token'
   */
  paramName?: string;

  /**
   * Whether to save the token to local storage if found in the URL.
   * @default true
   */
  saveToStorage?: boolean;

  /**
   * Whether to remove the token from the URL after retrieval for security.
   * @default true
   */
  removeFromUrl?: boolean;
}

/**
 * Configuration options for saving an access token.
 *
 * @internal
 *
 * @example
 * ```typescript
 * // Use default storage key
 * saveAccessToken('my-token-123', {});
 *
 * // Use custom storage key
 * saveAccessToken('my-token-123', { storageKey: 'my_app_token' });
 * ```
 */
export interface SaveAccessTokenOptions {
  /**
   * The key to use when storing the token in local storage.
   * @default 'base44_access_token'
   */
  storageKey?: string;
}

/**
 * Configuration options for removing an access token.
 *
 * @internal
 *
 * @example
 * ```typescript
 * // Remove token from default storage key
 * removeAccessToken({});
 *
 * // Remove token from custom storage key
 * removeAccessToken({ storageKey: 'my_app_token' });
 * ```
 */
export interface RemoveAccessTokenOptions {
  /**
   * The key to use when removing the token from local storage.
   * @default 'base44_access_token'
   */
  storageKey?: string;
}

/**
 * Configuration options for constructing a login URL.
 *
 * @internal
 *
 * @example
 * ```typescript
 * const loginUrl = getLoginUrl('/dashboard', {
 *   serverUrl: 'https://base44.app',
 *   appId: 'my-app-123'
 * });
 * // Returns: 'https://base44.app/login?from_url=%2Fdashboard&app_id=my-app-123'
 *
 * // Custom login path
 * const loginUrl = getLoginUrl('/dashboard', {
 *   serverUrl: 'https://base44.app',
 *   appId: 'my-app-123',
 *   loginPath: '/auth/login'
 * });
 * ```
 */
export interface GetLoginUrlOptions {
  /**
   * The base server URL (e.g., 'https://base44.app').
   */
  serverUrl: string;

  /**
   * The app ID.
   */
  appId: string;

  /**
   * The path to the login endpoint.
   * @default '/login'
   */
  loginPath?: string;
}

/**
 * Type definition for getAccessToken function.
 * @internal
 */
export type GetAccessTokenFunction = (
  options?: GetAccessTokenOptions
) => string | null;

/**
 * Type definition for saveAccessToken function.
 * @internal
 */
export type SaveAccessTokenFunction = (
  token: string,
  options: SaveAccessTokenOptions
) => boolean;

/**
 * Type definition for removeAccessToken function.
 * @internal
 */
export type RemoveAccessTokenFunction = (
  options: RemoveAccessTokenOptions
) => boolean;

/**
 * Type definition for getLoginUrl function.
 * @internal
 */
export type GetLoginUrlFunction = (
  nextUrl: string,
  options: GetLoginUrlOptions
) => string;
