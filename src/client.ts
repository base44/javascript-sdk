import { createAxiosClient } from "./utils/axios-client.js";
import { createEntitiesModule } from "./modules/entities.js";
import { createIntegrationsModule } from "./modules/integrations.js";
import { createAuthModule } from "./modules/auth.js";
import { createSsoModule } from "./modules/sso.js";
import {
  createConnectorsModule,
  createUserConnectorsModule,
} from "./modules/connectors.js";
import { getAccessToken } from "./utils/auth-utils.js";
import { createFunctionsModule } from "./modules/functions.js";
import { createAgentsModule } from "./modules/agents.js";
import { createAiGatewayModule } from "./modules/ai-gateway.js";
import { createAppLogsModule } from "./modules/app-logs.js";
import { createUsersModule } from "./modules/users.js";
import { RoomsSocket, RoomsSocketConfig } from "./utils/socket-utils.js";
import type {
  Base44Client,
  CreateClientConfig,
  CreateClientOptions,
} from "./client.types.js";
import { createAnalyticsModule } from "./modules/analytics.js";

// Re-export client types
export type { Base44Client, CreateClientConfig, CreateClientOptions };

/**
 * Creates a Base44 client.
 *
 * This is the main entry point for the Base44 SDK. It creates a client that provides access to the SDK's modules, such as {@linkcode EntitiesModule | entities}, {@linkcode AuthModule | auth}, and {@linkcode FunctionsModule | functions}.
 *
 * How you get a client depends on your context:
 * - **Inside a Base44 app:** The client is automatically created and configured for you. Import it from `@/api/base44Client`.
 * - **External app using Base44 as a backend:** Call `createClient()` directly in your code to create and configure the client.
 *
 * The client supports three authentication modes:
 * - **Anonymous**: Access modules without authentication using `base44.moduleName`. Operations are scoped to public data and permissions.
 * - **User authentication**: Access modules with user-level permissions using `base44.moduleName`. Operations are scoped to the authenticated user's data and permissions. Use `base44.auth.loginViaEmailPassword()` or other auth methods to get a token.
 * - **Service role authentication**: Access modules with elevated permissions using `base44.asServiceRole.moduleName`. Operations bypass entity access rules and field-level security, giving full read and write access to all of the app's data. Only available in Base44-hosted backend functions. Create a client with service role authentication using {@linkcode createClientFromRequest | createClientFromRequest()}.
 *
 * For example, when using the {@linkcode EntitiesModule | entities} module:
 * - **Anonymous**: Can only read public data.
 * - **User authentication**: Can access the current user's data.
 * - **Service role authentication**: Can read and write any record, bypassing access rules.
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

  // Normalize appBaseUrl to always be a string (empty if not provided or invalid)
  const normalizedAppBaseUrl = typeof appBaseUrl === "string" ? appBaseUrl : "";

  const socketConfig: RoomsSocketConfig = {
    serverUrl,
    mountPath: "/ws-user-apps/socket.io/",
    transports: ["websocket"],
    appId,
    token,
  };

  let socket: ReturnType<typeof RoomsSocket> | null = null;

  const getSocket = () => {
    if (!socket) {
      socket = RoomsSocket({
        config: socketConfig,
      });
    }
    return socket;
  };

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

  const serviceRoleHeaders = {
    ...headers,
    ...(token ? { "on-behalf-of": `Bearer ${token}` } : {}),
  };

  const serviceRoleAxiosClient = createAxiosClient({
    baseURL: `${serverUrl}/api`,
    headers: serviceRoleHeaders,
    token: serviceToken,
    onError: options?.onError,
  });

  const serviceRoleFunctionsAxiosClient = createAxiosClient({
    baseURL: `${serverUrl}/api`,
    headers: functionHeaders,
    token: serviceToken,
    interceptResponses: false,
  });

  const userAuthModule = createAuthModule(
    axiosClient,
    functionsAxiosClient,
    appId,
    {
      appBaseUrl: normalizedAppBaseUrl,
      serverUrl,
    }
  );

  // Apply the access token before any module that may issue authenticated
  // requests during construction (notably analytics, which fires an init
  // event whose flush calls auth.me()). Without this, the first User/me
  // request is built before setToken runs and goes out unauthenticated.
  if (typeof window !== "undefined") {
    const accessToken = token || getAccessToken();
    if (accessToken) {
      userAuthModule.setToken(accessToken);
    }
  }

  const userModules = {
    entities: createEntitiesModule({
      axios: axiosClient,
      appId,
      getSocket,
    }),
    integrations: createIntegrationsModule(axiosClient, appId),
    connectors: createUserConnectorsModule(axiosClient, appId),
    auth: userAuthModule,
    functions: createFunctionsModule(functionsAxiosClient, appId, {
      getAuthHeaders: () => {
        const headers: Record<string, string> = {};
        // Get current token from storage or initial config
        const currentToken = token || getAccessToken();
        if (currentToken) {
          headers["Authorization"] = `Bearer ${currentToken}`;
        }
        return headers;
      },
      baseURL: functionsAxiosClient.defaults?.baseURL,
    }),
    agents: createAgentsModule({
      axios: axiosClient,
      getSocket,
      appId,
      serverUrl,
      token,
    }),
    aiGateway: createAiGatewayModule({ serverUrl, appBaseUrl: normalizedAppBaseUrl, token }),
    appLogs: createAppLogsModule(axiosClient, appId),
    users: createUsersModule(axiosClient, appId),
    analytics: createAnalyticsModule({
      axiosClient,
      serverUrl,
      appId,
      userAuthModule,
    }),
    cleanup: () => {
      userModules.analytics.cleanup();
      if (socket) {
        socket.disconnect();
      }
    },
  };

  const serviceRoleModules = {
    entities: createEntitiesModule({
      axios: serviceRoleAxiosClient,
      appId,
      getSocket,
    }),
    integrations: createIntegrationsModule(serviceRoleAxiosClient, appId),
    sso: createSsoModule(serviceRoleAxiosClient, appId),
    connectors: createConnectorsModule(serviceRoleAxiosClient, appId),
    functions: createFunctionsModule(serviceRoleFunctionsAxiosClient, appId, {
      getAuthHeaders: () => {
        const headers: Record<string, string> = {};
        // Use service token for authorization
        if (serviceToken) {
          headers["Authorization"] = `Bearer ${serviceToken}`;
        }
        return headers;
      },
      baseURL: serviceRoleFunctionsAxiosClient.defaults?.baseURL,
    }),
    agents: createAgentsModule({
      axios: serviceRoleAxiosClient,
      getSocket,
      appId,
      serverUrl,
      token,
    }),
    aiGateway: createAiGatewayModule({ serverUrl, appBaseUrl: normalizedAppBaseUrl, token: serviceToken }),
    appLogs: createAppLogsModule(serviceRoleAxiosClient, appId),
    cleanup: () => {
      if (socket) {
        socket.disconnect();
      }
    },
  };

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
      if (socket) {
        socket.updateConfig({
          token: newToken,
        });
      }
      socketConfig.token = newToken;
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
     * Service role authentication provides elevated permissions for backend operations. Unlike user authentication, which is scoped to a specific user's permissions, service role authentication bypasses entity access rules and field-level security entirely, giving full read and write access to all of the app's data.
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
     * // Read every user record, bypassing the User entity's access rules
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
 * This function is designed for use in Base44-hosted backend functions. For frontends and external backends, use {@linkcode createClient | createClient()} instead.
 *
 * When used in a Base44-hosted backend function, `createClientFromRequest()` automatically extracts authentication tokens from the request headers that Base44 injects when forwarding requests. The returned client includes service role access using `base44.asServiceRole`, which bypasses entity access rules and field-level security.
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
 *     // Read across all users, bypassing the Orders entity's access rules
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
  const appBaseUrlHeader = request.headers.get("Base44-App-Base-Url");
  const functionsVersion = request.headers.get("Base44-Functions-Version");
  const stateHeader = request.headers.get("Base44-State");

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

  // Prepare additional headers to propagate
  const additionalHeaders: Record<string, string> = {};
  if (stateHeader) {
    additionalHeaders["Base44-State"] = stateHeader;
  }

  return createClient({
    serverUrl: serverUrlHeader || "https://base44.app",
    appBaseUrl: appBaseUrlHeader ?? undefined,
    appId,
    token: userToken,
    serviceToken: serviceRoleToken,
    functionsVersion: functionsVersion ?? undefined,
    headers: additionalHeaders,
  });
}
