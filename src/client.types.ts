import type { EntitiesModule } from "./modules/entities.types.js";
import type { IntegrationsModule } from "./modules/integrations.types.js";
import type { AuthModule } from "./modules/auth.types.js";
import type { SsoModule } from "./modules/sso.types.js";
import type { ConnectorsModule } from "./modules/connectors.types.js";
import type { FunctionsModule } from "./modules/functions.types.js";
import type { AgentsModule } from "./modules/agents.types.js";
import type { AppLogsModule } from "./modules/app-logs.types.js";
import type { AnalyticsModule } from "./modules/analytics.types.js";

/**
 * Options for creating a Base44 client.
 */
export interface CreateClientOptions {
  /**
   * Optional error handler that will be called whenever an API error occurs.
   */
  onError?: (error: Error) => void;
}

/**
 * Configuration for creating a Base44 client.
 */
export interface CreateClientConfig {
  /**
   * The Base44 server URL. Defaults to "https://base44.app".
   * @internal
   */
  serverUrl?: string;
  /**
   * The base URL of the app, which is used for login redirects.
   * @internal
   */
  appBaseUrl?: string;
  /**
   * The Base44 app ID.
   *
   * You can find the `appId` in the browser URL when you're in the app editor.
   * It's the string between `/apps/` and `/editor/`.
   */
  appId: string;
  /**
   * User authentication token. Used to authenticate as a specific user.
   */
  token?: string;
  /**
   * Service role authentication token. Use this in the backend when you need elevated permissions to access data available to the app's admin or perform admin operations. This token should be kept secret and never exposed in the app's frontend. Typically, you get this token from a request to a backend function using {@linkcode createClientFromRequest | createClientFromRequest()}.
   */
  serviceToken?: string;
  /**
   * Whether authentication is required. If true, redirects to login if not authenticated.
   * @internal
   */
  requiresAuth?: boolean;
  /**
   * Version string for functions API.
   * @internal
   */
  functionsVersion?: string;
  /**
   * Additional headers to include in API requests.
   * @internal
   */
  headers?: Record<string, string>;
  /**
   * Whether to use the staging database. Defaults to false.
   * When true, API requests will use the staging database instead of production.
   */
  useStagingDb?: boolean;
  /**
   * Additional client options.
   */
  options?: CreateClientOptions;
}

/**
 * The Base44 client instance.
 *
 * Provides access to all SDK modules for interacting with the app.
 */
export interface Base44Client {
  /** {@link EntitiesModule | Entities module} for CRUD operations on your data models. */
  entities: EntitiesModule;
  /** {@link IntegrationsModule | Integrations module} for calling pre-built integration endpoints. */
  integrations: IntegrationsModule;
  /** {@link AuthModule | Auth module} for user authentication and management. */
  auth: AuthModule;
  /** {@link FunctionsModule | Functions module} for invoking custom backend functions. */
  functions: FunctionsModule;
  /** {@link AgentsModule | Agents module} for managing AI agent conversations. */
  agents: AgentsModule;
  /** {@link AppLogsModule | App logs module} for tracking app usage. */
  appLogs: AppLogsModule;
  /** {@link AnalyticsModule | Analytics module} for tracking app usage. */
  analytics: AnalyticsModule;
  /** Cleanup function to disconnect WebSocket connections. Call when you're done with the client. */
  cleanup: () => void;

  /**
   * Sets a new authentication token for all subsequent requests.
   *
   * Updates the token for both HTTP requests and WebSocket connections.
   *
   * @param newToken - The new authentication token.
   */
  setToken(newToken: string): void;

  /**
   * Gets the current client configuration.
   * @internal
   */
  getConfig(): { serverUrl: string; appId: string; requiresAuth: boolean };

  /**
   * Provides access to supported modules with elevated permissions.
   *
   * Service role authentication provides elevated permissions for backend operations. Unlike user authentication, which is scoped to a specific user's permissions, service role authentication has access to the data and operations available to the app's admin.
   *
   * @throws {Error} When accessed without providing a serviceToken during client creation
   */
  readonly asServiceRole: {
    /** {@link EntitiesModule | Entities module} with elevated permissions. */
    entities: EntitiesModule;
    /** {@link IntegrationsModule | Integrations module} with elevated permissions. */
    integrations: IntegrationsModule;
    /** {@link SsoModule | SSO module} for generating SSO tokens.
     * @internal
     */
    sso: SsoModule;
    /** {@link ConnectorsModule | Connectors module} for OAuth token retrieval. */
    connectors: ConnectorsModule;
    /** {@link FunctionsModule | Functions module} with elevated permissions. */
    functions: FunctionsModule;
    /** {@link AgentsModule | Agents module} with elevated permissions. */
    agents: AgentsModule;
    /** {@link AppLogsModule | App logs module} with elevated permissions. */
    appLogs: AppLogsModule;
    /** Cleanup function to disconnect WebSocket connections. */
    cleanup: () => void;
  };
}
