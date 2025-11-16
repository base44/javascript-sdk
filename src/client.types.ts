import type { EntitiesModule } from "./modules/entities.types.js";
import type { IntegrationsModule } from "./modules/integrations.types.js";
import type { AuthModule } from "./modules/auth.types.js";
import type { SsoModule } from "./modules/sso.types.js";
import type { ConnectorsModule } from "./modules/connectors.types.js";
import type { FunctionsModule } from "./modules/functions.types.js";
import type { AgentsModule } from "./modules/agents.types.js";
import type { AppLogsModule } from "./modules/app-logs.types.js";

/**
 * Options for creating a Base44 client.
 */
export type CreateClientOptions = {
  /**
   * Optional error handler that will be called whenever an API error occurs.
   */
  onError?: (error: Error) => void;
};

/**
 * Configuration for creating a Base44 client.
 */
export type CreateClientConfig = {
  /**
   * The Base44 server URL. Defaults to "https://base44.app".
   * @internal
   */
  serverUrl?: string;
  /**
   * The base URL of your application (used for login redirects).
   * @internal
   */
  appBaseUrl?: string;
  /** Your Base44 application ID. */
  appId: string;
  /**
   * User authentication token. Use this for client-side applications where you want to
   * authenticate as a specific user.
   */
  token?: string;
  /**
   * Service role authentication token. Use this for server-side applications where you need
   * elevated permissions to access data across all users or perform admin operations. This token
   * should be kept secret and never exposed to the client.
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
   * Additional client options.
   * @internal
   */
  options?: CreateClientOptions;
};

/**
 * The Base44 client instance.
 *
 * Provides access to all SDK modules and methods for interacting with your Base44 app.
 *
 * This is the main client object returned by {@link createClient} and {@link createClientFromRequest}.
 * It includes all SDK modules and utility methods for managing authentication and configuration.
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
  /** {@link AppLogsModule | App logs module} for tracking application usage. */
  appLogs: AppLogsModule;
  /** Cleanup function to disconnect WebSocket connections. Call when you're done with the client. */
  cleanup: () => void;

  /**
   * Sets a new authentication token for all subsequent requests.
   *
   * Updates the token for both HTTP requests and WebSocket connections.
   *
   * @param newToken - The new authentication token
   */
  setToken(newToken: string): void;

  /**
   * Gets the current client configuration.
   * @internal
   */
  getConfig(): { serverUrl: string; appId: string; requiresAuth: boolean };

  /**
   * Provides access to service role modules with elevated permissions.
   *
   * Service role authentication provides elevated permissions for server-side operations.
   * Unlike user authentication, which is scoped to a specific user's permissions, service
   * role authentication has access to data and operations across all users.
   *
   * @throws {Error} When accessed without providing a serviceToken during client creation
   */
  readonly asServiceRole: {
    /** {@link EntitiesModule | Entities module} with elevated permissions. */
    entities: EntitiesModule;
    /** {@link IntegrationsModule | Integrations module} with elevated permissions. */
    integrations: IntegrationsModule;
    /** {@link SsoModule | SSO module} for generating SSO tokens (service role only). */
    sso: SsoModule;
    /** {@link ConnectorsModule | Connectors module} for OAuth token retrieval (service role only). */
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
