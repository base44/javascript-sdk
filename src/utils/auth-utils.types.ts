/**
 * Configuration options for retrieving an access token
 *
 * @example
 * ```typescript
 * // Use default options
 * const token = getAccessToken();
 *
 * // Custom storage key
 * const token = getAccessToken({ storageKey: 'my_app_token' });
 *
 * // Get token from URL but don't save or remove from URL
 * const token = getAccessToken({
 *   saveToStorage: false,
 *   removeFromUrl: false
 * });
 * ```
 */
export interface GetAccessTokenOptions {
  /**
   * The key to use when storing/retrieving the token in localStorage
   * @default 'base44_access_token'
   */
  storageKey?: string;

  /**
   * The URL parameter name to check for the access token
   * @default 'access_token'
   */
  paramName?: string;

  /**
   * Whether to save the token to localStorage if found in the URL
   * @default true
   */
  saveToStorage?: boolean;

  /**
   * Whether to remove the token from the URL after retrieval for security
   * @default true
   */
  removeFromUrl?: boolean;
}

/**
 * Configuration options for saving an access token
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
   * The key to use when storing the token in localStorage
   * @default 'base44_access_token'
   */
  storageKey?: string;
}

/**
 * Configuration options for removing an access token
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
   * The key to use when removing the token from localStorage
   * @default 'base44_access_token'
   */
  storageKey?: string;
}

/**
 * Configuration options for constructing a login URL
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
   * The base server URL (e.g., 'https://base44.app')
   */
  serverUrl: string;

  /**
   * The application ID
   */
  appId: string;

  /**
   * The path to the login endpoint
   * @default '/login'
   */
  loginPath?: string;
}

/**
 * Retrieves an access token from either the URL parameters or localStorage.
 *
 * This function is useful for handling OAuth redirects where the token is
 * passed as a URL parameter. It will automatically save the token to
 * localStorage and remove it from the URL for security.
 *
 * @param options - Configuration options for token retrieval
 * @returns The access token if found, null otherwise
 *
 * @remarks
 * - This function is browser-only and will return null in non-browser environments
 * - Checks URL parameters first, then falls back to localStorage
 * - By default, saves URL tokens to localStorage and removes them from the URL
 *
 * @example
 * ```typescript
 * // After OAuth redirect to: https://myapp.com?access_token=abc123
 * const token = getAccessToken();
 * // Returns: 'abc123' (and saves to localStorage, removes from URL)
 * ```
 *
 * @example
 * ```typescript
 * // Custom configuration
 * const token = getAccessToken({
 *   storageKey: 'my_app_token',
 *   paramName: 'token',
 *   saveToStorage: false,
 *   removeFromUrl: false
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Retrieve from localStorage only (no URL check)
 * const token = getAccessToken();
 * // Returns stored token or null
 * ```
 */
export type GetAccessTokenFunction = (
  options?: GetAccessTokenOptions
) => string | null;

/**
 * Saves an access token to localStorage.
 *
 * This function is browser-only and will return false in non-browser
 * environments or if the save operation fails.
 *
 * @param token - The access token to save
 * @param options - Configuration options for saving
 * @returns true if the token was saved successfully, false otherwise
 *
 * @remarks
 * - Also saves the token to 'token' key for backwards compatibility with platform v2
 * - Returns false if window.localStorage is not available
 *
 * @example
 * ```typescript
 * const success = saveAccessToken('my-token-123', {});
 * if (success) {
 *   console.log('Token saved successfully');
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Use custom storage key
 * const success = saveAccessToken('my-token-123', {
 *   storageKey: 'my_custom_token_key'
 * });
 * ```
 */
export type SaveAccessTokenFunction = (
  token: string,
  options: SaveAccessTokenOptions
) => boolean;

/**
 * Removes the access token from localStorage.
 *
 * This function is browser-only and will return false in non-browser
 * environments or if the removal operation fails.
 *
 * @param options - Configuration options for removal
 * @returns true if the token was removed successfully, false otherwise
 *
 * @example
 * ```typescript
 * // Remove token on logout
 * const success = removeAccessToken({});
 * if (success) {
 *   console.log('Token removed successfully');
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Remove custom token key
 * const success = removeAccessToken({
 *   storageKey: 'my_custom_token_key'
 * });
 * ```
 */
export type RemoveAccessTokenFunction = (
  options: RemoveAccessTokenOptions
) => boolean;

/**
 * Constructs the absolute URL for the login page with a redirect parameter.
 *
 * This function is useful for redirecting users to login and then back to
 * the current page after authentication.
 *
 * @param nextUrl - The URL to redirect to after successful login
 * @param options - Configuration options for constructing the login URL
 * @returns The complete login URL with encoded redirect parameters
 *
 * @throws Error if serverUrl or appId are not provided
 *
 * @remarks
 * - The nextUrl is URL-encoded for safe transmission
 * - If nextUrl is empty and running in browser, uses current window.location.href
 *
 * @example
 * ```typescript
 * // Basic usage
 * const loginUrl = getLoginUrl('/dashboard', {
 *   serverUrl: 'https://base44.app',
 *   appId: 'my-app-123'
 * });
 * // Returns: 'https://base44.app/login?from_url=%2Fdashboard&app_id=my-app-123'
 * ```
 *
 * @example
 * ```typescript
 * // With custom login path
 * const loginUrl = getLoginUrl('https://myapp.com/protected', {
 *   serverUrl: 'https://base44.app',
 *   appId: 'my-app-123',
 *   loginPath: '/auth/signin'
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Redirect to login in React
 * function ProtectedPage() {
 *   const handleLogin = () => {
 *     const loginUrl = getLoginUrl(window.location.href, {
 *       serverUrl: 'https://base44.app',
 *       appId: 'my-app-123'
 *     });
 *     window.location.href = loginUrl;
 *   };
 *
 *   return <button onClick={handleLogin}>Login</button>;
 * }
 * ```
 */
export type GetLoginUrlFunction = (
  nextUrl: string,
  options: GetLoginUrlOptions
) => string;
