/**
 * Utility functions for authentication and token handling
 */

/**
 * Retrieves an access token from either localStorage or URL parameters
 * 
 * @param {Object} options - Configuration options
 * @param {string} [options.storageKey='base44_access_token'] - The key to use in localStorage
 * @param {string} [options.paramName='access_token'] - The URL parameter name
 * @param {boolean} [options.saveToStorage=true] - Whether to save the token to localStorage if found in URL
 * @param {boolean} [options.removeFromUrl=true] - Whether to remove the token from URL after retrieval
 * @returns {string|null} The access token or null if not found
 */
export function getAccessToken(options = {}) {
  const {
    storageKey = 'base44_access_token',
    paramName = 'access_token',
    saveToStorage = true,
    removeFromUrl = true
  } = options;
  
  let token = null;
  
  // Try to get token from URL parameters
  if (typeof window !== 'undefined' && window.location) {
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
          const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ''}${window.location.hash}`;
          window.history.replaceState({}, document.title, newUrl);
        }
        
        return token;
      }
    } catch (e) {
      console.error('Error retrieving token from URL:', e);
    }
  }
  
  // If no token in URL, try localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      token = window.localStorage.getItem(storageKey);
      return token;
    } catch (e) {
      console.error('Error retrieving token from localStorage:', e);
    }
  }
  
  return null;
}

/**
 * Saves an access token to localStorage
 * 
 * @param {string} token - The access token to save
 * @param {Object} options - Configuration options
 * @param {string} [options.storageKey='base44_access_token'] - The key to use in localStorage
 * @returns {boolean} Success status
 */
export function saveAccessToken(token, options = {}) {
  const { storageKey = 'base44_access_token' } = options;
  
  if (typeof window === 'undefined' || !window.localStorage || !token) {
    return false;
  }
  
  try {
    window.localStorage.setItem(storageKey, token);
    return true;
  } catch (e) {
    console.error('Error saving token to localStorage:', e);
    return false;
  }
}

/**
 * Removes the access token from localStorage
 * 
 * @param {Object} options - Configuration options
 * @param {string} [options.storageKey='base44_access_token'] - The key to use in localStorage
 * @returns {boolean} Success status
 */
export function removeAccessToken(options = {}) {
  const { storageKey = 'base44_access_token' } = options;
  
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }
  
  try {
    window.localStorage.removeItem(storageKey);
    return true;
  } catch (e) {
    console.error('Error removing token from localStorage:', e);
    return false;
  }
}

/**
 * Constructs the absolute URL for the login page
 * 
 * @param {string} nextUrl - URL to redirect back to after login
 * @param {Object} options - Configuration options
 * @param {string} options.serverUrl - Server URL (e.g., 'https://base44.app')
 * @param {string|number} options.appId - Application ID
 * @param {string} [options.loginPath='/login'] - Path to the login endpoint
 * @returns {string} The complete login URL
 */
export function getLoginUrl(nextUrl, options) {
  const { serverUrl, appId, loginPath = '/login' } = options;
  
  if (!serverUrl || !appId) {
    throw new Error('serverUrl and appId are required to construct login URL');
  }
  
  const encodedRedirectUrl = encodeURIComponent(nextUrl || (typeof window !== 'undefined' ? window.location.href : ''));
  return `${serverUrl}${loginPath}?from_url=${encodedRedirectUrl}&app_id=${appId}`;
} 