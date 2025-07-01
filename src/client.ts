import { createAxiosClient } from "./utils/axios-client.js";
import { createEntitiesModule } from "./modules/entities.js";
import { createIntegrationsModule } from "./modules/integrations.js";
import { createAuthModule } from "./modules/auth.js";
import { getAccessToken } from "./utils/auth-utils.js";

/**
 * Create a Base44 client instance
 * @param {Object} config - Client configuration
 * @param {string} [config.serverUrl='https://base44.app'] - API server URL
 * @param {string|number} config.appId - Application ID
 * @param {string} [config.env='prod'] - Environment ('prod' or 'dev')
 * @param {string} [config.token] - Authentication token
 * @param {boolean} [config.requiresAuth=false] - Whether the app requires authentication
 * @returns {Object} Base44 client instance
 */
export function createClient(config: {
  serverUrl?: string;
  appId: string;
  env?: string;
  token?: string;
  requiresAuth?: boolean;
}) {
  const {
    serverUrl = "https://base44.app",
    appId,
    env = "prod",
    token,
    requiresAuth = false,
  } = config;

  // Create the base axios client
  const axiosClient = createAxiosClient({
    baseURL: `${serverUrl}/api`,
    headers: {
      "X-App-Id": String(appId),
      "X-Environment": env,
    },
    token,
    requiresAuth, // Pass requiresAuth to axios client
    appId, // Pass appId for login redirect
    serverUrl, // Pass serverUrl for login redirect
  });

  // Create modules
  const entities = createEntitiesModule(axiosClient, appId);
  const integrations = createIntegrationsModule(axiosClient, appId);
  const auth = createAuthModule(axiosClient, appId, serverUrl);

  // Always try to get token from localStorage or URL parameters
  if (typeof window !== "undefined") {
    // Get token from URL or localStorage
    const accessToken = token || getAccessToken();
    if (accessToken) {
      auth.setToken(accessToken);
    }
  }

  // If authentication is required, verify token and redirect to login if needed
  if (requiresAuth && typeof window !== "undefined") {
    // We perform this check asynchronously to not block client creation
    setTimeout(async () => {
      try {
        const isAuthenticated = await auth.isAuthenticated();
        if (!isAuthenticated) {
          auth.login(window.location.href);
        }
      } catch (error) {
        console.error("Authentication check failed:", error);
        auth.login(window.location.href);
      }
    }, 0);
  }

  // Assemble and return the client
  return {
    entities,
    integrations,
    auth,

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
