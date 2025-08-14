import { createAxiosClient } from "./utils/axios-client.js";
import { createEntitiesModule } from "./modules/entities.js";
import { createIntegrationsModule } from "./modules/integrations.js";
import { createAuthModule } from "./modules/auth.js";
import { getAccessToken } from "./utils/auth-utils.js";
import { createFunctionsModule } from "./modules/functions.js";

/**
 * Create a Base44 client instance
 * @param {Object} config - Client configuration
 * @param {string} [config.serverUrl='https://base44.app'] - API server URL
 * @param {string|number} config.appId - Application ID
 * @param {string} [config.token] - Authentication token
 * @param {string} [config.serviceToken] - Service role authentication token
 * @param {boolean} [config.requiresAuth=false] - Whether the app requires authentication
 * @returns {Object} Base44 client instance
 */
export function createClient(config: {
  serverUrl?: string;
  appId: string;
  token?: string;
  serviceToken?: string;
  requiresAuth?: boolean;
}) {
  const {
    serverUrl = "https://base44.app",
    appId,
    token,
    serviceToken,
    requiresAuth = false,
  } = config;

  const axiosClient = createAxiosClient({
    baseURL: `${serverUrl}/api`,
    headers: {
      "X-App-Id": String(appId),
    },
    token,
    requiresAuth,
    appId,
    serverUrl,
  });

  const functionsAxiosClient = createAxiosClient({
    baseURL: `${serverUrl}/api`,
    headers: {
      "X-App-Id": String(appId),
    },
    token,
    requiresAuth,
    appId,
    serverUrl,
    interceptResponses: false,
  });

  const serviceRoleAxiosClient = createAxiosClient({
    baseURL: `${serverUrl}/api`,
    headers: {
      "X-App-Id": String(appId),
    },
    token: serviceToken,
    serverUrl,
    appId,
  });

  const serviceRoleFunctionsAxiosClient = createAxiosClient({
    baseURL: `${serverUrl}/api`,
    headers: {
      "X-App-Id": String(appId),
    },
    token: serviceToken,
    serverUrl,
    appId,
    interceptResponses: false,
  });

  const userModules = {
    entities: createEntitiesModule(axiosClient, appId),
    integrations: createIntegrationsModule(axiosClient, appId),
    auth: createAuthModule(axiosClient, functionsAxiosClient, appId),
    functions: createFunctionsModule(functionsAxiosClient, appId),
  };

  const serviceRoleModules = {
    entities: createEntitiesModule(serviceRoleAxiosClient, appId),
    integrations: createIntegrationsModule(serviceRoleAxiosClient, appId),
    functions: createFunctionsModule(serviceRoleFunctionsAxiosClient, appId),
  };

  // Always try to get token from localStorage or URL parameters
  if (typeof window !== "undefined") {
    // Get token from URL or localStorage
    const accessToken = token || getAccessToken();
    if (accessToken) {
      userModules.auth.setToken(accessToken);
    }
  }

  // If authentication is required, verify token and redirect to login if needed
  if (requiresAuth && typeof window !== "undefined") {
    // We perform this check asynchronously to not block client creation
    setTimeout(async () => {
      try {
        const isAuthenticated = await userModules.auth.isAuthenticated();
        if (!isAuthenticated) {
          userModules.auth.redirectToLogin(window.location.href);
        }
      } catch (error) {
        console.error("Authentication check failed:", error);
        userModules.auth.redirectToLogin(window.location.href);
      }
    }, 0);
  }

  // Assemble and return the client
  const client = {
    ...userModules,

    /**
     * Set authentication token for all requests
     * @param {string} newToken - New auth token
     */
    setToken(newToken: string) {
      userModules.auth.setToken(newToken);
    },

    /**
     * Get current configuration
     * @returns {Object} Current configuration
     */
    getConfig() {
      return {
        serverUrl,
        appId,
        requiresAuth,
      };
    },

    /**
     * Access service role modules - throws error if no service token was provided
     * @throws {Error} When accessed without a service token
     */
    get asServiceRole() {
      if (!serviceToken) {
        throw new Error('Service token is required to use asServiceRole. Please provide a serviceToken when creating the client.');
      }
      return serviceRoleModules;
    }
  };

  return client;
}

export function createClientFromRequest(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const serviceRoleAuthHeader = request.headers.get(
    "Base44-Service-Authorization"
  );
  const appId = request.headers.get("Base44-App-Id");
  const serverUrlHeader = request.headers.get("Base44-Api-Url");

  if (!appId) {
    throw new Error(
      "Base44-App-Id header is required, but is was not found on the request"
    );
  }

  const serviceRoleToken = serviceRoleAuthHeader?.split(" ")[1];
  const userToken = authHeader?.split(" ")[1];

  return createClient({
    serverUrl: serverUrlHeader || "https://base44.app",
    appId,
    token: userToken,
    serviceToken: serviceRoleToken,
  });
}
