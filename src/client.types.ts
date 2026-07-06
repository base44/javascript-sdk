import type { AxiosRequestConfig } from "axios";
import type { EntitiesModule } from "./modules/entities.types.js";
import type { IntegrationsModule } from "./modules/integrations.types.js";
import type { AuthModule } from "./modules/auth.types.js";
import type { SsoModule } from "./modules/sso.types.js";
import type {
  ConnectorsModule,
  UserConnectorsModule,
} from "./modules/connectors.types.js";
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
   * The Base44 server URL.
   *
   * You don't need to set this for production use. The SDK defaults to `https://base44.app`.
   *
   * Set this when using a local development server to point SDK requests at your local machine instead of the hosted backend.
   *
   * @defaultValue `"https://base44.app"`
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
   *
   * Inside Base44 apps, the token is managed automatically. For external apps, use auth methods like {@linkcode AuthModule.loginViaEmailPassword | loginViaEmailPassword()} which set the token automatically.
   */
  token?: string;
  /**
   * Service role authentication token. Provides elevated permissions that bypass entity access rules and field-level security. Only available in Base44-hosted backend functions. Automatically added to clients created using {@linkcode createClientFromRequest | createClientFromRequest()}.
   * @internal
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
   * Disables the {@link AnalyticsModule | analytics module} entirely.
   *
   * When `true`, `base44.analytics.track()` becomes a no-op and no background
   * processing or heartbeat timers are started. Set this for server-side
   * clients (SSR, edge runtimes) where background timers must not run.
   * {@linkcode createServerClient | createServerClient()} sets this automatically.
   *
   * Analytics is also automatically disabled outside a browser environment.
   *
   * @defaultValue `false`
   */
  disableAnalytics?: boolean;
  /**
   * Axios adapter override for HTTP requests.
   *
   * By default, axios picks an adapter based on the runtime. Set this to
   * `'fetch'` in edge runtimes such as Cloudflare Workers, where the default
   * adapter detection can pick the wrong adapter.
   * {@linkcode createServerClient | createServerClient()} sets this automatically.
   */
  adapter?: AxiosRequestConfig["adapter"];
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
  /** {@link AgentsModule | Agents module} for managing AI agent conversations. */
  agents: AgentsModule;
  /** {@link AnalyticsModule | Analytics module} for tracking custom events in your app. */
  analytics: AnalyticsModule;
  /** {@link AppLogsModule | App logs module} for tracking app usage. */
  appLogs: AppLogsModule;
  /** {@link AuthModule | Auth module} for user authentication and management. */
  auth: AuthModule;
  /** {@link UserConnectorsModule | Connectors module} for app-user OAuth flows. */
  connectors: UserConnectorsModule;
  /** {@link EntitiesModule | Entities module} for CRUD operations on your data models. */
  entities: EntitiesModule;
  /** {@link FunctionsModule | Functions module} for invoking custom backend functions. */
  functions: FunctionsModule;
  /** {@link IntegrationsModule | Integrations module} for calling pre-built integration endpoints. */
  integrations: IntegrationsModule;
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
   * Service role authentication provides elevated permissions for backend operations. Unlike user authentication, which is scoped to a specific user's permissions, service role authentication bypasses entity access rules and field-level security entirely, giving full read and write access to all of the app's data.
   *
   * @throws {Error} When accessed without providing a serviceToken during client creation
   */
  readonly asServiceRole: {
    /** {@link AgentsModule | Agents module} with elevated permissions. */
    agents: AgentsModule;
    /** {@link AppLogsModule | App logs module} with elevated permissions. */
    appLogs: AppLogsModule;
    /** {@link ConnectorsModule | Connectors module} for OAuth token retrieval. */
    connectors: ConnectorsModule;
    /** {@link EntitiesModule | Entities module} with elevated permissions. */
    entities: EntitiesModule;
    /** {@link FunctionsModule | Functions module} with elevated permissions. */
    functions: FunctionsModule;
    /** {@link IntegrationsModule | Integrations module} with elevated permissions. */
    integrations: IntegrationsModule;
    /** {@link SsoModule | SSO module} for generating SSO tokens.
     * @internal
     */
    sso: SsoModule;
    /** Cleanup function to disconnect WebSocket connections. */
    cleanup: () => void;
  };
}
