import {
  GetAccessTokenOptions,
  SaveAccessTokenOptions,
  RemoveAccessTokenOptions,
  GetLoginUrlOptions,
} from "./auth-utils.types.js";
import { EMBED_TOKEN_PARAM, isFramed } from "./embed-session.js";

/** The URL parameter a Base44 session token arrives on. */
const DEFAULT_TOKEN_PARAM = "access_token";

/**
 * Retrieves an access token from URL parameters or local storage.
 *
 * Low-level utility for manually retrieving tokens. In most cases, the Base44 client handles
 * token management automatically. This function is useful for custom authentication flows or when you need direct access to stored tokens. Requires a browser environment and can't be used in the backend.
 *
 * When a host platform has embedded the app with a one-time token (`?ott=`), that token is returned as it stands: it is what {@linkcode createClient} trades for the session, so a page that gates on "is there a token?" as it loads sees one. It is neither stored nor removed from the URL here, and it is reported only inside a frame, where such a token is redeemed.
 *
 * @internal
 *
 * @param options - Configuration options for token retrieval.
 * @returns The access token string if found, null otherwise.
 *
 * @example
 * ```typescript
 * // Get access token from URL or local storage
 * const token = getAccessToken();
 *
 * if (token) {
 *   console.log('User is authenticated');
 * } else {
 *   console.log('No token found, redirect to login');
 * }
 * ```
 * @example
 * ```typescript
 * // Get access token from custom local storage key
 * const token = getAccessToken({ storageKey: 'my_app_token' });
 * ```
 * @example
 * ```typescript
 * // Get access token from URL but don't save or remove it
 * const token = getAccessToken({
 *   saveToStorage: false,
 *   removeFromUrl: false
 * });
 * ```
 */
export function getAccessToken(options: GetAccessTokenOptions = {}) {
  const {
    storageKey = "base44_access_token",
    paramName = DEFAULT_TOKEN_PARAM,
    saveToStorage = true,
    removeFromUrl = true,
  } = options;

  let token = null;

  // Try to get token from URL parameters
  if (typeof window !== "undefined" && window.location) {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      token = urlParams.get(paramName);

      // If token found in URL
      if (token) {
        // Save token to local storage if requested
        if (saveToStorage) {
          saveAccessToken(token, { storageKey });
        }

        // Remove token from URL for security if requested
        if (removeFromUrl) {
          urlParams.delete(paramName);
          const newUrl = `${window.location.pathname}${
            urlParams.toString() ? `?${urlParams.toString()}` : ""
          }${window.location.hash}`;
          window.history.replaceState({}, document.title, newUrl);
        }

        return token;
      }

      // A platform-embedded load carries a one-time token instead. It is not a
      // session yet — createClient takes it off the URL and exchanges it — but
      // it is the identity this load arrives with, and callers that read this
      // once as the page loads must not conclude there is none.
      //
      // Only in a frame, and only for the parameter a session arrives on: a
      // one-time token is redeemed nowhere else, so a top-level load still
      // carrying one (a URL rewrite the browser refused) must not have it
      // applied as a session — and never saved as one.
      if (paramName === DEFAULT_TOKEN_PARAM && isFramed()) {
        const embedToken = urlParams.get(EMBED_TOKEN_PARAM);
        if (embedToken) {
          return embedToken;
        }
      }
    } catch (e) {
      console.error("Error retrieving token from URL:", e);
    }
  }

  // If no token in URL, try local storage
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      token = window.localStorage.getItem(storageKey);
      return token;
    } catch (e) {
      console.error("Error retrieving token from local storage:", e);
    }
  }

  return null;
}

/**
 * Saves an access token to local storage.
 *
 * Low-level utility for manually saving tokens. In most cases, the Base44 client handles token management automatically. This function is useful for custom authentication flows or managing custom tokens. Requires a browser environment and can't be used in the backend.
 *
 * @internal
 *
 * @param token - The access token string to save.
 * @param options - Configuration options for saving the token.
 * @returns Returns`true` if the token was saved successfully, `false` otherwise.
 *
 * @example
 * ```typescript
 * // Save access token after login
 * const response = await base44.auth.loginViaEmailPassword(email, password);
 * const success = saveAccessToken(response.access_token, {});
 *
 * if (success) {
 *   console.log('User is now authenticated');
 *   // Token is now available for future page loads
 * }
 * ```
 * @example
 * ```typescript
 * // Save access token to local storage using custom key
 * const success = saveAccessToken(token, {
 *   storageKey: `my_custom_token_key`
 * });
 * ```
 */
export function saveAccessToken(
  token: string,
  options: SaveAccessTokenOptions
) {
  const { storageKey = "base44_access_token" } = options;

  if (typeof window === "undefined" || !window.localStorage || !token) {
    return false;
  }

  try {
    window.localStorage.setItem(storageKey, token);
    // Set "token" that is set by the built-in SDK of platform version 2
    window.localStorage.setItem("token", token);
    return true;
  } catch (e) {
    console.error("Error saving token to local storage:", e);
    return false;
  }
}

/**
 * Removes the access token from local storage.
 *
 * Low-level utility for manually removing tokens from the browser's local storage. In most cases, the Base44 client handles token management automatically. For standard logout flows, use {@linkcode AuthModule.logout | base44.auth.logout()} instead, which handles token removal and redirects automatically. This function is useful for custom authentication flows or when you need to manually remove tokens. Requires a browser environment and can't be used in the backend.
 *
 * @internal
 *
 * @param options - Configuration options for token removal.
 * @returns Returns `true` if the token was removed successfully, `false` otherwise.
 *
 * @example
 * ```typescript
 * // Remove custom token key
 * const success = removeAccessToken({
 *   storageKey: 'my_custom_token_key'
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Standard logout flow with token removal and redirect
 * base44.auth.logout('/login');
 * ```
 */
export function removeAccessToken(options: RemoveAccessTokenOptions) {
  const { storageKey = "base44_access_token" } = options;

  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }

  try {
    window.localStorage.removeItem(storageKey);
    return true;
  } catch (e) {
    console.error("Error removing token from local storage:", e);
    return false;
  }
}

/**
 * Constructs the absolute URL for the login page with a redirect parameter.
 *
 * Low-level utility for building login URLs. For standard login redirects, use {@linkcode AuthModule.redirectToLogin | base44.auth.redirectToLogin()} instead, which handles this automatically. This function is useful when you need to construct login URLs without a client instance or for custom authentication flows.
 *
 * @internal
 *
 * @param nextUrl - The URL to redirect to after successful login.
 * @param options - Configuration options.
 * @returns The complete login URL with encoded redirect parameters.
 *
 * @example
 * ```typescript
 * // Redirect to login page
 * const loginUrl = getLoginUrl('/dashboard', {
 *   serverUrl: 'https://base44.app',
 *   appId: 'my-app-123'
 * });
 * window.location.href = loginUrl;
 * // User will be redirected back to /dashboard after login
 * ```
 */
export function getLoginUrl(nextUrl: string, options: GetLoginUrlOptions) {
  const { serverUrl, appId, loginPath = "/login" } = options;

  if (!serverUrl || !appId) {
    throw new Error("serverUrl and appId are required to construct login URL");
  }

  const encodedRedirectUrl = encodeURIComponent(
    nextUrl || (typeof window !== "undefined" ? window.location.href : "")
  );
  return `${serverUrl}${loginPath}?from_url=${encodedRedirectUrl}&app_id=${appId}`;
}
