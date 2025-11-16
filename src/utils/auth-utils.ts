import {
  GetAccessTokenOptions,
  SaveAccessTokenOptions,
  RemoveAccessTokenOptions,
  GetLoginUrlOptions,
} from "./auth-utils.types.js";

// Retrieve an access token from URL parameters or localStorage
export function getAccessToken(options: GetAccessTokenOptions = {}) {
  const {
    storageKey = "base44_access_token",
    paramName = "access_token",
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
        // Save token to localStorage if requested
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
    } catch (e) {
      console.error("Error retrieving token from URL:", e);
    }
  }

  // If no token in URL, try localStorage
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      token = window.localStorage.getItem(storageKey);
      return token;
    } catch (e) {
      console.error("Error retrieving token from localStorage:", e);
    }
  }

  return null;
}

// Save an access token to localStorage
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
    console.error("Error saving token to localStorage:", e);
    return false;
  }
}

// Remove the access token from localStorage
export function removeAccessToken(options: RemoveAccessTokenOptions) {
  const { storageKey = "base44_access_token" } = options;

  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }

  try {
    window.localStorage.removeItem(storageKey);
    return true;
  } catch (e) {
    console.error("Error removing token from localStorage:", e);
    return false;
  }
}

// Construct the absolute URL for the login page with redirect
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
