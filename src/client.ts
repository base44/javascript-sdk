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

/**
 * Options for creating a Base44 client.
 */
export type CreateClientOptions = {
  /**
   * Optional error handler that will be called whenever an API error occurs.
   *
   * @example
   * ```typescript
   * const client = createClient({
   *   appId: 'my-app',
   *   options: {
   *     onError: (error) => {
   *       console.error('API Error:', error);
   *       // Send to error tracking service
   *       Sentry.captureException(error);
   *     }
   *   }
   * });
   * ```
   */
  onError?: (error: Error) => void;
};

/**
 * The Base44 client instance type.
 *
 * Provides access to all SDK modules and methods for interacting with your Base44 app.
 */
export type Base44Client = ReturnType<typeof createClient>;

/**
 * Creates a Base44 SDK client instance.
 *
 * This is the main entry point for the Base44 SDK. It creates a client that provides
 * access to all SDK modules including entities, auth, functions, integrations, agents,
 * and more.
 *
 * **User Modules (default access):**
 * - `entities` - CRUD operations for your data
 * - `integrations` - Pre-built integration endpoints
 * - `auth` - User authentication and management
 * - `functions` - Custom backend functions
 * - `agents` - AI agent conversations
 * - `appLogs` - Application usage tracking
 *
 * **Service Role Modules (via `asServiceRole`):**
 * - All user modules PLUS:
 * - `sso` - SSO token generation
 * - `connectors` - OAuth token retrieval
 *
 * @param config - Client configuration options
 * @returns Base44 client instance with access to all modules
 *
 * @example
 * ```typescript
 * // Basic client setup
 * import { createClient } from '@base44/client-sdk';
 *
 * const client = createClient({
 *   appId: 'my-app-id'
 * });
 *
 * // Use client modules
 * const todos = await client.entities.Todo.list();
 * const user = await client.auth.me();
 * ```
 *
 * @example
 * ```typescript
 * // Client with authentication
 * const client = createClient({
 *   appId: 'my-app-id',
 *   token: 'user-auth-token',
 *   requiresAuth: true  // Automatically redirects to login if not authenticated
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Client with service role access
 * const client = createClient({
 *   appId: 'my-app-id',
 *   token: 'user-token',
 *   serviceToken: 'service-role-token'
 * });
 *
 * // Access service-role-only modules
 * const ssoToken = await client.asServiceRole.sso.getAccessToken('user-123');
 * const oauthToken = await client.asServiceRole.connectors.getAccessToken('google');
 * ```
 *
 * @example
 * ```typescript
 * // Client with error handling
 * const client = createClient({
 *   appId: 'my-app-id',
 *   options: {
 *     onError: (error) => {
 *       console.error('API Error:', error);
 *       Sentry.captureException(error);
 *     }
 *   }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Client with custom server URL (self-hosted)
 * const client = createClient({
 *   serverUrl: 'https://my-base44-instance.com',
 *   appId: 'my-app-id'
 * });
 * ```
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
     * Updates the token for both HTTP requests and WebSocket connections.
     *
     * @param newToken - The new authentication token
     *
     * @example
     * ```typescript
     * // Update token after login
     * const { access_token } = await client.auth.loginViaEmailPassword(
     *   'user@example.com',
     *   'password'
     * );
     * client.setToken(access_token);
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
     * @returns Current configuration including serverUrl, appId, and requiresAuth
     *
     * @example
     * ```typescript
     * const config = client.getConfig();
     * console.log(config.appId);       // 'my-app-id'
     * console.log(config.serverUrl);   // 'https://base44.app'
     * console.log(config.requiresAuth); // true/false
     * ```
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
     * Service role modules have elevated permissions and include additional
     * modules like `sso` and `connectors` that are not available with regular
     * user authentication.
     *
     * **Available modules:**
     * - All regular user modules (entities, auth, functions, etc.)
     * - `sso` - SSO token generation
     * - `connectors` - OAuth token retrieval
     *
     * @throws {Error} When accessed without providing a serviceToken during client creation
     *
     * @example
     * ```typescript
     * const client = createClient({
     *   appId: 'my-app-id',
     *   serviceToken: 'service-role-token'
     * });
     *
     * // Access service-role-only features
     * const ssoToken = await client.asServiceRole.sso.getAccessToken('user-123');
     * const googleToken = await client.asServiceRole.connectors.getAccessToken('google');
     *
     * // Also access regular modules with elevated permissions
     * const allUsers = await client.asServiceRole.entities.User.list();
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
 * Creates a Base44 client from an HTTP request (server-side helper).
 *
 * This is a convenience function for server-side environments (like Next.js API routes,
 * Edge functions, or Express servers) that automatically extracts authentication tokens
 * and configuration from request headers.
 *
 * **Required Headers:**
 * - `Base44-App-Id` - Your Base44 application ID
 *
 * **Optional Headers:**
 * - `Authorization` - User authentication token (format: "Bearer <token>")
 * - `Base44-Service-Authorization` - Service role token (format: "Bearer <token>")
 * - `Base44-Api-Url` - Custom API URL (defaults to https://base44.app)
 * - `Base44-Functions-Version` - Functions version
 *
 * @param request - HTTP Request object (standard Fetch API Request)
 * @returns Base44 client instance configured from request headers
 *
 * @throws {Error} When Base44-App-Id header is missing
 * @throws {Error} When authorization headers have invalid format
 *
 * @example
 * ```typescript
 * // Next.js API Route
 * import { createClientFromRequest } from '@base44/client-sdk';
 *
 * export async function GET(request: Request) {
 *   const client = createClientFromRequest(request);
 *   const data = await client.entities.Product.list();
 *   return Response.json(data);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Edge Function (Vercel, Cloudflare Workers, Deno Deploy)
 * export default async function handler(request: Request) {
 *   const client = createClientFromRequest(request);
 *   const user = await client.auth.me();
 *   return new Response(JSON.stringify(user));
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Express.js (with adapter for Request object)
 * import express from 'express';
 *
 * app.get('/api/data', async (req, res) => {
 *   // Convert Express req to Fetch API Request
 *   const request = new Request(`http://localhost${req.url}`, {
 *     headers: req.headers
 *   });
 *   const client = createClientFromRequest(request);
 *   const data = await client.entities.Todo.list();
 *   res.json(data);
 * });
 * ```
 */
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
