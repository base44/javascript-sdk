import { createAxiosClient } from "./utils/axios-client.js";
import { createEntitiesModule } from "./modules/entities.js";
import { createIntegrationsModule } from "./modules/integrations.js";
import { createAuthModule } from "./modules/auth.js";
import { createSsoModule } from "./modules/sso.js";
import { createAppConnectionsModule } from "./modules/app-connections.js";
import { getAccessToken } from "./utils/auth-utils.js";
import { createFunctionsModule } from "./modules/functions.js";
import { createAgentsModule } from "./modules/agents.js";
import { createAppLogsModule } from "./modules/app-logs.js";
import { RoomsSocket, RoomsSocketConfig } from "./utils/socket-utils.js";

export type CreateClientOptions = {
  onError?: (error: Error) => void;
};

export type Base44Client = ReturnType<typeof createClient>;

/**
 * Create a Base44 client instance
 * @param {Object} config - Client configuration
 * @param {string} [config.serverUrl='https://base44.app'] - API server URL
 * @param {string} [config.appBaseUrl] - Application base URL
 * @param {string|number} config.appId - Application ID
 * @param {string} [config.token] - Authentication token
 * @param {string} [config.serviceToken] - Service role authentication token
 * @param {boolean} [config.requiresAuth=false] - Whether the app requires authentication
 * @returns {Object} Base44 client instance
 */
export function createClient(config: {
  serverUrl?: string;
  appBaseUrl?: string;
  appId: string;
  token?: string;
  serviceToken?: string;
  requiresAuth?: boolean;
  functionsVersion?: string;
  headers?: Record<string, string>;
  options?: CreateClientOptions;
}) {
  const {
    serverUrl = "https://base44.app",
    appId,
    token,
    serviceToken,
    requiresAuth = false,
    appBaseUrl,
    options,
    functionsVersion,
    headers: optionalHeaders,
  } = config;

  const socketConfig: RoomsSocketConfig = {
    serverUrl,
    mountPath: "/ws-user-apps/socket.io/",
    transports: ["websocket"],
    appId,
    token,
  };

  const socket = RoomsSocket({
    config: socketConfig,
  });

  const headers = {
    ...optionalHeaders,
    "X-App-Id": String(appId),
  };

  const functionHeaders = functionsVersion
    ? {
        ...headers,
        "Base44-Functions-Version": functionsVersion,
      }
    : headers;

  const axiosClient = createAxiosClient({
    baseURL: `${serverUrl}/api`,
    headers,
    token,
    onError: options?.onError,
  });

  const functionsAxiosClient = createAxiosClient({
    baseURL: `${serverUrl}/api`,
    headers: functionHeaders,
    token,
    interceptResponses: false,
    onError: options?.onError,
  });

  const serviceRoleAxiosClient = createAxiosClient({
    baseURL: `${serverUrl}/api`,
    headers,
    token: serviceToken,
    onError: options?.onError,
  });

  const serviceRoleFunctionsAxiosClient = createAxiosClient({
    baseURL: `${serverUrl}/api`,
    headers: functionHeaders,
    token: serviceToken,
    interceptResponses: false,
  });

  const userModules = {
    entities: createEntitiesModule(axiosClient, appId),
    integrations: createIntegrationsModule(axiosClient, appId),
    auth: createAuthModule(axiosClient, functionsAxiosClient, appId, {
      appBaseUrl,
      serverUrl,
    }),
    functions: createFunctionsModule(functionsAxiosClient, appId),
    agents: createAgentsModule({
      axios: axiosClient,
      socket,
      appId,
      serverUrl,
      token,
    }),
    appLogs: createAppLogsModule(axiosClient, appId),
    cleanup: () => {
      socket.disconnect();
    },
  };

  const serviceRoleModules = {
    entities: createEntitiesModule(serviceRoleAxiosClient, appId),
    integrations: createIntegrationsModule(serviceRoleAxiosClient, appId),
    sso: createSsoModule(serviceRoleAxiosClient, appId, token),
    appConnections: createAppConnectionsModule(serviceRoleAxiosClient, appId),
    functions: createFunctionsModule(serviceRoleFunctionsAxiosClient, appId),
    agents: createAgentsModule({
      axios: serviceRoleAxiosClient,
      socket,
      appId,
      serverUrl,
      token,
    }),
    appLogs: createAppLogsModule(serviceRoleAxiosClient, appId),
    cleanup: () => {
      socket.disconnect();
    },
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
      socket.updateConfig({
        token: newToken,
      });
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
        throw new Error(
          "Service token is required to use asServiceRole. Please provide a serviceToken when creating the client."
        );
      }
      return serviceRoleModules;
    },
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
  const functionsVersion = request.headers.get("Base44-Functions-Version");

  if (!appId) {
    throw new Error(
      "Base44-App-Id header is required, but is was not found on the request"
    );
  }

  // Validate authorization header formats
  let serviceRoleToken: string | undefined;
  let userToken: string | undefined;

  if (serviceRoleAuthHeader !== null) {
    if (
      serviceRoleAuthHeader === "" ||
      !serviceRoleAuthHeader.startsWith("Bearer ") ||
      serviceRoleAuthHeader.split(" ").length !== 2
    ) {
      throw new Error(
        'Invalid authorization header format. Expected "Bearer <token>"'
      );
    }
    serviceRoleToken = serviceRoleAuthHeader.split(" ")[1];
  }

  if (authHeader !== null) {
    if (
      authHeader === "" ||
      !authHeader.startsWith("Bearer ") ||
      authHeader.split(" ").length !== 2
    ) {
      throw new Error(
        'Invalid authorization header format. Expected "Bearer <token>"'
      );
    }
    userToken = authHeader.split(" ")[1];
  }

  return createClient({
    serverUrl: serverUrlHeader || "https://base44.app",
    appId,
    token: userToken,
    serviceToken: serviceRoleToken,
    functionsVersion: functionsVersion ?? undefined,
  });
}
