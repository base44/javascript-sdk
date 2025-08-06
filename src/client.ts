import { createAxiosClient } from "./utils/axios-client.js";
import { createEntitiesModule } from "./modules/entities.js";
import { createIntegrationsModule } from "./modules/integrations.js";
import { createAuthModule } from "./modules/auth.js";
import { getAccessToken } from "./utils/auth-utils.js";
import { createFunctionsModule } from "./modules/functions.js";

/**
 * Client configuration - supports token OR API key authentication (mutually exclusive)
 */
type ClientConfig = {
  serverUrl?: string;
  appId: string;
  env?: string;
  requiresAuth?: boolean;
} & (
  | {}
  | {
      apiKey: string;
    }
  | {
      token: string;
    }
);

/**
 * Create a Base44 client instance
 * @param {Object} config - Client configuration
 * @param {string} [config.serverUrl='https://base44.app'] - API server URL
 * @param {string|number} config.appId - Application ID
 * @param {string} [config.env='prod'] - Environment ('prod' or 'dev')
 * @param {string} [config.token] - Authentication token (mutually exclusive with apiKey)
 * @param {string} [config.apiKey] - API key (mutually exclusive with token)
 * @param {boolean} [config.requiresAuth=false] - Whether the app requires authentication
 * @returns {Object} Base44 client instance
 */
export function createClient(config: ClientConfig) {
  const {
    serverUrl = "https://base44.app",
    appId,
    env = "prod",
    requiresAuth = false,
  } = config;

  const apiKey = "apiKey" in config ? config.apiKey : undefined;
  const token = "token" in config ? config.token : undefined;

  // Create the base axios client
  const axiosClient = createAxiosClient({
    baseURL: `${serverUrl}/api`,
    headers: {
      "X-App-Id": String(appId),
      "X-Environment": env,
    },
    token,
    apiKey,
    requiresAuth, // Pass requiresAuth to axios client
    appId, // Pass appId for login redirect
    serverUrl, // Pass serverUrl for login redirect
  });

  const functionsAxiosClient = createAxiosClient({
    baseURL: `${serverUrl}/api`,
    headers: {
      "X-App-Id": String(appId),
      "X-Environment": env,
    },
    token,
    apiKey,
    requiresAuth,
    appId,
    serverUrl,
    interceptResponses: false,
  });

  // Create modules
  const entities = createEntitiesModule(axiosClient, appId);
  const integrations = createIntegrationsModule(axiosClient, appId);
  const auth = createAuthModule(axiosClient, appId, serverUrl, !!apiKey);
  const functions = createFunctionsModule(functionsAxiosClient, appId);

  // Always try to get token from localStorage or URL parameters (only for token auth)
  if (typeof window !== "undefined" && !apiKey) {
    // Get token from URL or localStorage
    const accessToken = token || getAccessToken();
    if (accessToken) {
      auth.setToken(accessToken);
    }
  }

  // If authentication is required, verify token and redirect to login if needed (only for token auth)
  if (requiresAuth && typeof window !== "undefined" && !apiKey) {
    // We perform this check asynchronously to not block client creation
    setTimeout(async () => {
      try {
        const isAuthenticated = await auth.isAuthenticated();
        if (!isAuthenticated) {
          auth.redirectToLogin(window.location.href);
        }
      } catch (error) {
        console.error("Authentication check failed:", error);
        auth.redirectToLogin(window.location.href);
      }
    }, 0);
  }

  // Assemble and return the client
  return {
    entities,
    integrations,
    auth,
    functions,

    /**
     * Set authentication token for all requests
     * @param {string} newToken - New auth token
     */
    setToken(newToken: string) {
      auth.setToken(newToken);
    },

    /**
     * Get current configuration
     * @returns {Object} Current configuration
     */
    getConfig() {
      return {
        serverUrl,
        appId,
        env,
        requiresAuth,
      };
    },
  };
}
