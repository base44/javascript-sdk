import { createAxiosClient } from "./utils/axios-client.js";
import { createEntitiesModule } from "./modules/entities.js";
import { createIntegrationsModule } from "./modules/integrations.js";
import { createAuthModule } from "./modules/auth.js";
import { createSsoModule } from "./modules/sso.js";
import { createConnectorsModule } from "./modules/connectors.js";
import { getAccessToken } from "./utils/auth-utils.js";
import { createFunctionsModule } from "./modules/functions.js";
import { createAgentsModule } from "./modules/agents.js";
import { createAppLogsModule } from "./modules/app-logs.js";
import { RoomsSocket, RoomsSocketConfig } from "./utils/socket-utils.js";
import type {
  Base44Client,
  CreateClientConfig,
  CreateClientOptions,
} from "./client.types.js";

// Re-export client types
export type { Base44Client, CreateClientConfig, CreateClientOptions };

/**
 * Creates a Base44 client.
 *
 * This is the main entry point for the Base44 SDK. It creates a client that provides access to the SDK's modules, such as {@linkcode EntitiesModule | entities}, {@linkcode AuthModule | auth}, and {@linkcode FunctionsModule | functions}.
 *
 * Typically, you don't need to call this function because Base44 creates the client for you. You can then import and use the client to make API calls. The client takes care of managing authentication for you.
 *
 * The client supports three authentication modes:
 * - **Anonymous**: Access modules anonymously without authentication using `base44.moduleName`. Operations are scoped to public data and permissions.
 * - **User authentication**: Access modules with user-level permissions using `base44.moduleName`. Operations are scoped to the authenticated user's data and permissions.
 * - **Service role authentication**: Access modules with elevated permissions using `base44.asServiceRole.moduleName`. Operations can access data across all users. Can only be used in the backend. Typically, you create a client with service role authentication using the {@linkcode createClientFromRequest | createClientFromRequest()} function in your backend functions.
 *
 * For example, when using the {@linkcode EntitiesModule | entities} module:
 * - **Anonymous**: Can only read public data.
 * - **User authentication**: Can access the current user's data.
 * - **Service role authentication**: Can access all data that admins can access.
 *
 * Most modules are available in all three modes, but with different permission levels. However, some modules are only available in specific authentication modes.
 *
 * @param config - Configuration object for the client.
 * @returns A configured Base44 client instance with access to all SDK modules.
 *
 * @example
 * ```typescript
 * // Create a client for your app
 * import { createClient } from '@base44/sdk';
 *
 * const base44 = createClient({
 *   appId: 'my-app-id'
 * });
 *
 * // Use the client to access your data
 * const products = await base44.entities.Products.list();
 * ```
 */
export function createClient(config: CreateClientConfig): Base44Client {
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
    connectors: createConnectorsModule(serviceRoleAxiosClient, appId),
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
     * Sets a new authentication token for all subsequent requests.
     *
     * @param newToken - The new authentication token
     *
     * @example
     * ```typescript
     * // Update token after login
     * const { access_token } = await base44.auth.loginViaEmailPassword(
     *   'user@example.com',
     *   'password'
     * );
     * base44.setToken(access_token);
     * ```
     */
    setToken(newToken: string) {
      userModules.auth.setToken(newToken);
      socket.updateConfig({
        token: newToken,
      });
    },

    /**
     * Gets the current client configuration.
     *
     * @internal
     */
    getConfig() {
      return {
        serverUrl,
        appId,
        requiresAuth,
      };
    },

    /**
     * Provides access to service role modules.
     *
     * Service role authentication provides elevated permissions for server-side operations. Unlike user authentication, which is scoped to a specific user's permissions, service role authentication has access to data and operations across all users.
     *
     * @throws {Error} When accessed without providing a serviceToken during client creation.
     *
     * @example
     * ```typescript
     * const base44 = createClient({
     *   appId: 'my-app-id',
     *   serviceToken: 'service-role-token'
     * });
     *
     * // Also access a module with elevated permissions
     * const allUsers = await base44.asServiceRole.entities.User.list();
     * ```
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

/**
 * Creates a Base44 client from an HTTP request.
 *
 * The client is created by automatically extracting authentication tokens from a request to a backend function. Base44 inserts the necessary headers when forwarding requests to backend functions.
 *
 * To learn more about the Base44 client, see {@linkcode createClient | createClient()}.
 *
 * @param request - The incoming HTTP request object containing Base44 authentication headers.
 * @returns A configured Base44 client instance with authentication from the incoming request.
 *
 * @example
 * ```typescript
 * // User authentication in backend function
 * import { createClientFromRequest } from 'npm:@base44/sdk';
 *
 * Deno.serve(async (req) => {
 *   try {
 *     const base44 = createClientFromRequest(req);
 *     const user = await base44.auth.me();
 *
 *     if (!user) {
 *       return Response.json({ error: 'Unauthorized' }, { status: 401 });
 *     }
 *
 *     // Access user's data
 *     const userOrders = await base44.entities.Orders.filter({ userId: user.id });
 *     return Response.json({ orders: userOrders });
 *   } catch (error) {
 *     return Response.json({ error: error.message }, { status: 500 });
 *   }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Service role authentication in backend function
 * import { createClientFromRequest } from 'npm:@base44/sdk';
 *
 * Deno.serve(async (req) => {
 *   try {
 *     const base44 = createClientFromRequest(req);
 *
 *     // Access admin data with service role permissions
 *     const recentOrders = await base44.asServiceRole.entities.Orders.list('-created_at', 50);
 *
 *     return Response.json({ orders: recentOrders });
 *   } catch (error) {
 *     return Response.json({ error: error.message }, { status: 500 });
 *   }
 * });
 * ```
 *
 */
export function createClientFromRequest(request: Request): Base44Client {
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
