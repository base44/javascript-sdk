/**
 * Registry of connector integration type names. The [`types generate`](/developers/references/cli/commands/types-generate) command fills this registry, then [`ConnectorIntegrationType`](#connectorintegrationtype) resolves to a union of the keys.
 */
export interface ConnectorIntegrationTypeRegistry {}

/**
 * Union of all connector integration type names from the [`ConnectorIntegrationTypeRegistry`](#connectorintegrationtyperegistry). Defaults to `string` when no types have been generated.
 *
 * @example
 * ```typescript
 * // Using generated connector type names
 * // With generated types, you get autocomplete on integration types
 * const connection = await base44.asServiceRole.connectors.getConnection('googlecalendar');
 * const token = connection.accessToken;
 * ```
 */
export type ConnectorIntegrationType =
  keyof ConnectorIntegrationTypeRegistry extends never
    ? string
    : keyof ConnectorIntegrationTypeRegistry;

/**
 * Response from the connectors access token endpoint.
 */
export interface ConnectorAccessTokenResponse {
  access_token: string;
  integration_type: string;
  connection_config: Record<string, string> | null;
}

/**
 * Connection details.
 */
export interface ConnectorConnectionResponse {
  /** The OAuth access token for the external service. */
  accessToken: string;
  /** Key-value configuration for the connection, or `null` if the connector does not provide one. */
  connectionConfig: Record<string, string> | null;
}

/**
 * Connection details for an app user connector.
 */
export interface AppUserConnectorConnectionResponse {
  /** The OAuth access token for the app user's connection. */
  accessToken: string;
  /** Key-value configuration for the connection, or `null` if the connector does not provide one. */
  connectionConfig: Record<string, string> | null;
}

/**
 * A request to forward to a metered connector's API through the Base44 proxy.
 */
export interface ConnectorApiRequest {
  /** HTTP method for the upstream request. Defaults to `'GET'`. */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
  /**
   * Path relative to the connector's API root, starting with `/`, such as `'/2/tweets'`.
   *
   * Must not be an absolute URL. Query parameters may be included here or passed
   * separately as {@link query}; either way they are forwarded and priced identically.
   */
  path: string;
  /** Query parameters. Merged into the request URL alongside any already present in {@link path}. */
  query?: Record<string, string | number | boolean | Array<string | number>>;
  /** Extra request headers. Only headers the connector explicitly allows are forwarded; the rest are dropped. */
  headers?: Record<string, string>;
  /** JSON request body. Ignored for `GET`, `HEAD`, and `DELETE`. */
  body?: unknown;
}

/**
 * The upstream API's response, as returned by the Base44 connector proxy.
 */
export interface ConnectorApiResponse<T = unknown> {
  /** `true` when the upstream API returned a 2xx status. */
  success: boolean;
  /** The upstream HTTP status code, or `null` if the request never reached the provider. */
  status: number | null;
  /** The parsed upstream response body. */
  data: T;
  /** The subset of upstream response headers the connector exposes, typically rate-limit counters. */
  headers: Record<string, string>;
  /** Integration credits billed to the workspace for this call. */
  creditsCharged: number;
}

/**
 * Raw proxy response shape. Mapped to {@link ConnectorApiResponse} before being returned.
 * @internal
 */
export interface ConnectorProxyRawResponse {
  success: boolean;
  status_code: number | null;
  data: unknown;
  headers: Record<string, string>;
  credits_charged: number;
}

/**
 * Connectors module for managing OAuth tokens for external services.
 *
 * Unlike the {@link IntegrationsModule | integrations} module that provides pre-built functions, connectors give you raw OAuth tokens so you can call external service APIs directly. Use this when you need custom API interactions that the pre-built integrations do not cover.
 *
 * There are two connector types, depending on whether the token is shared across the app or specific to each user:
 *
 * - **[Shared connectors](#shared-connectors):** A single OAuth token shared by all app users. Best for shared service accounts.
 * - **[App user connectors](#app-user-connectors):** Each app user has their own OAuth token. Best for actions that need to happen as the individual user.
 *
 * ## Shared connectors
 *
 * All app users share a single OAuth token. Use this for shared accounts. For example, posting to a company Slack channel or reading from a shared Google Calendar.
 *
 * Shared connectors come in two forms, depending on how the connector is set up. Both return the same app-wide token, so they differ only in how you identify the connector in code:
 *
 * - **Platform connectors** are connected from the app's Integration settings or with the [`connectors push`](/developers/references/cli/commands/connectors-push) CLI command, and are identified by an [integration type](#available-connectors) string. Retrieve them with {@linkcode getConnection | getConnection()}.
 * - **Workspace-registered connectors** are backed by your own OAuth app, registered once in Workspace Settings and consented to by the app builder. They are identified by a connector ID instead of an integration type. Retrieve them with {@linkcode getWorkspaceConnection | getWorkspaceConnection()}. Connectors whose OAuth app is specific to your own account, such as Databricks and Snowflake, work this way.
 *
 * To use a shared connector, call the matching method on the service role client `base44.asServiceRole.connectors` from a backend function, then use the returned `accessToken` to call the external service's API directly. Some connectors also return a `connectionConfig` with additional values, such as a subdomain, that you need to build the API URL.
 *
 * ## App user connectors
 *
 * Each signed-in app user has their own OAuth token. Use this when each user needs to act as themselves. For example, sending emails from their Gmail account or posting to their personal LinkedIn. To use an app user connector:
 *
 * 1. Register OAuth credentials for the service in Workspace Settings to get a **connector ID**. This requires workspace admin access.
 * 2. From the frontend, call [connectAppUser()](#connectappuser) with the connector ID to get an authorization URL, then redirect the app user to that URL to complete the OAuth flow.
 * 3. In a backend function, call {@linkcode getCurrentAppUserConnection | getCurrentAppUserConnection()} using the service role client (`base44.asServiceRole.connectors`) with the connector ID to retrieve the app user's token.
 * 4. Use the returned `accessToken` to call the external service's API directly. Some connectors also return a `connectionConfig` with additional values such as a subdomain for building the API URL.
 *
 * ## Metered connectors
 *
 * A few connectors are backed by paid third-party APIs that charge Base44 per call. For those, the OAuth token is **not** available to your code: {@linkcode getConnection | getConnection()} and its siblings reject with a `403`. Call them through the Base44 proxy instead, with {@linkcode callApi | callApi()}, {@linkcode callWorkspaceApi | callWorkspaceApi()}, or {@linkcode callCurrentAppUserApi | callCurrentAppUserApi()}. Base44 attaches the credential server-side, forwards the request, and bills your workspace's integration credits for the call.
 *
 * Two things to keep in mind when writing against a metered connector:
 *
 * - **Cost varies by endpoint, sometimes sharply.** The same connector can charge two orders of magnitude more for one endpoint than another, so avoid putting an expensive call inside a loop and batch wherever the provider supports it. Each response reports what it actually cost as `creditsCharged`.
 * - **An upstream error is returned, not thrown.** A `4xx` or `5xx` from the provider comes back as `success: false` with the provider's own `status` and `data`, because it is a normal outcome of a call that Base44 completed. Only Base44-side failures — no connection, credits exhausted, a rejected request — reject the promise.
 *
 * ## Available connectors
 *
 * The connectors below can be used as shared connectors or as app user connectors. For a shared platform connector, pass the integration type string to {@linkcode getConnection | getConnection()}. For a connector you register in Workspace Settings with your own OAuth app, use the connector ID with {@linkcode getWorkspaceConnection | getWorkspaceConnection()} for a shared token, or with {@linkcode getCurrentAppUserConnection | getCurrentAppUserConnection()} for a per-user token.
 *
 * | Service | Type identifier |
 * |---|---|
 * | Airtable | `airtable` |
 * | BambooHR | `bamboohr` |
 * | Box | `box` |
 * | Calendly | `calendly` |
 * | ClickUp | `clickup` |
 * | Contentful | `contentful` |
 * | Databricks | `databricks` |
 * | Discord | `discord` |
 * | Dropbox | `dropbox` |
 * | GitHub | `github` |
 * | GitLab | `gitlab` |
 * | Gmail | `gmail` |
 * | Google Ads | `googleads` |
 * | Google Analytics | `google_analytics` |
 * | Google BigQuery | `googlebigquery` |
 * | Google Calendar | `googlecalendar` |
 * | Google Classroom | `google_classroom` |
 * | Google Docs | `googledocs` |
 * | Google Drive | `googledrive` |
 * | Google Meet | `googlemeet` |
 * | Google Search Console | `google_search_console` |
 * | Google Sheets | `googlesheets` |
 * | Google Slides | `googleslides` |
 * | Google Tasks | `googletasks` |
 * | HubSpot | `hubspot` |
 * | Hugging Face | `hugging_face` |
 * | Instagram Business | `instagram` |
 * | Linear | `linear` |
 * | LinkedIn | `linkedin` |
 * | Microsoft Teams | `microsoft_teams` |
 * | Microsoft OneDrive | `one_drive` |
 * | Notion | `notion` |
 * | Outlook | `outlook` |
 * | QuickBooks | `quickbooks` |
 * | Salesforce | `salesforce` |
 * | SharePoint | `share_point` |
 * | Slack User | `slack` |
 * | Slack Bot | `slackbot` |
 * | Snowflake | `snowflake` |
 * | Splitwise | `splitwise` |
 * | Square | `square` |
 * | Supabase | `supabase` |
 * | TikTok | `tiktok` |
 * | Typeform | `typeform` |
 * | Wix | `wix` |
 * | Wrike | `wrike` |
 *
 * See the integration guides for more details:
 *
 * - **Scopes and permissions**: {@link https://docs.base44.com/Integrations/gmail-connector#gmail-scopes-and-permissions | Gmail}, {@link https://docs.base44.com/Integrations/linkedin-connector#linkedin-scopes-and-permissions | LinkedIn}, {@link https://docs.base44.com/Integrations/slack-connector#slack-scopes-and-permissions | Slack}, {@link https://docs.base44.com/Integrations/github-connector#github-scopes-and-permissions | GitHub}
 * - **Slack connector types**: {@link https://docs.base44.com/Integrations/slack-connector#about-the-slack-connectors | About the Slack connectors} explains the difference between `slack` and `slackbot`
 *
 * ## Dynamic Types
 *
 * If you're working in a TypeScript project, you can generate types from your app's connector configurations to get autocomplete on integration type names when calling {@link getConnection}. See the [Dynamic Types](/developers/references/sdk/getting-started/dynamic-types) guide to get started.
 */
export interface ConnectorsModule {
  /**
   * Retrieves an OAuth access token for a specific [external integration type](#available-connectors).
   *
   * @deprecated Use {@link getConnection} instead.
   *
   * Returns the OAuth token string for an external service connected to the app.
   * This token represents the connected account and can be used to make authenticated API calls to that external service on behalf of the app.
   *
   * @param integrationType - The type of integration, such as `'googlecalendar'`, `'slack'`, `'slackbot'`, `'github'`, or `'discord'`. See [Available connectors](#available-connectors) for the full list.
   * @returns Promise resolving to the access token string.
   *
   * @example
   * ```typescript
   * // Google Calendar connection
   * // Get Google Calendar OAuth token and fetch upcoming events
   * const googleToken = await base44.asServiceRole.connectors.getAccessToken('googlecalendar');
   *
   * // Fetch upcoming 10 events
   * const timeMin = new Date().toISOString();
   * const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&orderBy=startTime&singleEvents=true&timeMin=${timeMin}`;
   *
   * const response = await fetch(url, {
   *   headers: { 'Authorization': `Bearer ${googleToken}` }
   * });
   *
   * const events = await response.json();
   * ```
   *
   * @example
   * ```typescript
   * // Slack User connection
   * // Get Slack user token and list channels
   * const slackToken = await base44.asServiceRole.connectors.getAccessToken('slack');
   *
   * // List all public and private channels
   * const url = 'https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=100';
   *
   * const response = await fetch(url, {
   *   headers: { 'Authorization': `Bearer ${slackToken}` }
   * });
   *
   * const data = await response.json();
   * ```
   *
   * @example
   * ```typescript
   * // Slack Bot connection
   * // Get Slack bot token and post a message with a custom bot identity
   * const botToken = await base44.asServiceRole.connectors.getAccessToken('slackbot');
   *
   * const response = await fetch('https://slack.com/api/chat.postMessage', {
   *   method: 'POST',
   *   headers: {
   *     'Authorization': `Bearer ${botToken}`,
   *     'Content-Type': 'application/json'
   *   },
   *   body: JSON.stringify({
   *     channel: '#alerts',
   *     text: 'Deployment to production completed successfully.',
   *     username: 'Deploy Bot',
   *     icon_emoji: ':rocket:'
   *   })
   * });
   *
   * const result = await response.json();
   * ```
   */
  getAccessToken(integrationType: ConnectorIntegrationType): Promise<string>;

  /**
   * Retrieves the shared OAuth access token and connection configuration for a [shared connector](#shared-connectors) to a specific [external integration type](#available-connectors).
   *
   * Use this when a single shared account is connected and all app users access the same token. For per-user tokens, use [`getCurrentAppUserConnection()`](#getcurrentappuserconnection) instead.
   *
   * This form is for platform connectors identified by an integration type. Connectors backed by your own OAuth app registered in Workspace Settings, such as Databricks and Snowflake, are retrieved by connector ID with {@linkcode getWorkspaceConnection | getWorkspaceConnection()} instead.
   *
   * Some connectors require connection-specific parameters to build API calls.
   * In such cases, the returned `connectionConfig` is an object with the additional parameters. If there are no extra parameters needed for the connection, the `connectionConfig` is `null`.
   *
   * For example, a service might need a subdomain to construct the API URL in
   * the form of `{subdomain}.example.com`. In such a case the subdomain will be available as a property of the `connectionConfig` object.
   *
   * @param integrationType - The type of integration, such as `'googlecalendar'`, `'slack'`, `'slackbot'`, `'github'`, or `'discord'`. See [Available connectors](#available-connectors) for the full list.
   * @returns Promise resolving to a {@link ConnectorConnectionResponse} with `accessToken` and `connectionConfig`.
   *
   * @example
   * ```typescript
   * // Google Calendar connection
   * const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
   *
   * const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
   *   headers: { Authorization: `Bearer ${accessToken}` }
   * });
   *
   * const { items } = await response.json();
   * ```
   *
   * @example
   * ```typescript
   * // Slack connection
   * // Get Slack OAuth token and list channels
   * const { accessToken } = await base44.asServiceRole.connectors.getConnection('slack');
   *
   * const url = 'https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=100';
   *
   * const response = await fetch(url, {
   *   headers: { Authorization: `Bearer ${accessToken}` }
   * });
   *
   * const data = await response.json();
   * ```
   *
   * @example
   * ```typescript
   * // Using connectionConfig
   * // Some connectors return a subdomain or other params needed to build the API URL
   * const { accessToken, connectionConfig } = await base44.asServiceRole.connectors.getConnection('myservice');
   *
   * const subdomain = connectionConfig?.subdomain;
   * const response = await fetch(
   *   `https://${subdomain}.example.com/api/v1/resources`,
   *   { headers: { Authorization: `Bearer ${accessToken}` } }
   * );
   *
   * const data = await response.json();
   * ```
   */
  getConnection(
    integrationType: ConnectorIntegrationType,
  ): Promise<ConnectorConnectionResponse>;

  /**
   * Retrieves the shared OAuth access token and connection configuration for a [workspace-registered connector](#shared-connectors).
   *
   * Use this for a connector backed by your own OAuth app that you register in Workspace Settings, such as Databricks or Snowflake. The app builder consents to the connector once, and the returned token is shared across all app users of the app. This is the shared-token counterpart to {@linkcode getCurrentAppUserConnection | getCurrentAppUserConnection()}, which returns a per-user token for the same kind of connector. The semantics match {@linkcode getConnection | getConnection()}, except that you identify the connector by ID rather than by integration type.
   *
   * Some connectors require connection-specific parameters to build API calls. In such cases, the returned `connectionConfig` is an object with those parameters, such as the account subdomain used to construct the API URL. When no extra parameters are needed, `connectionConfig` is `null`.
   *
   * @param connectorId - The ID of the workspace connector, not the integration type string. You can find it on the connector's settings page in Workspace Settings.
   * @returns Promise resolving to a {@link ConnectorConnectionResponse} with `accessToken` and `connectionConfig`.
   *
   * @example
   * ```typescript
   * // Snowflake connection
   * // Retrieve the shared token and run a statement against the account
   * const { accessToken, connectionConfig } = await base44.asServiceRole.connectors.getWorkspaceConnection('abc123def');
   *
   * const response = await fetch(
   *   `https://${connectionConfig?.subdomain}.snowflakecomputing.com/api/v2/statements`,
   *   { headers: { Authorization: `Bearer ${accessToken}` } }
   * );
   *
   * const data = await response.json();
   * ```
   */
  getWorkspaceConnection(
    connectorId: string,
  ): Promise<ConnectorConnectionResponse>;

  /**
   * @internal
   * @deprecated Use {@link getCurrentAppUserConnection} instead.
   */
  getCurrentAppUserAccessToken(connectorId: string): Promise<string>;

  /**
   * Retrieves the OAuth access token and connection configuration for an [app user connector](#app-user-connectors).
   *
   * The token returned is specific to the app user making the current request. For this to work, the SDK client must know which app user to act on behalf of. Use {@linkcode createClientFromRequest | createClientFromRequest()} in a Base44 backend function to create such a client. It reads the app user's JWT from the incoming request and attaches it automatically so the runtime can resolve the correct user's connection.
   *
   * The connector must be registered in Workspace Settings with OAuth credentials before this method can return a connection. The app user must also have completed the OAuth flow using [connectAppUser()](#connectappuser).
   *
   * @param connectorId - The ID of the app user connector configured in your workspace. This is not the integration type string. You can find it on the connector's settings page in Workspace Settings.
   * @returns Promise resolving to an {@link AppUserConnectorConnectionResponse} with `accessToken` and `connectionConfig`.
   *
   * @example
   * ```typescript
   * // Basic usage
   * const { accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection('abc123def');
   *
   * const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
   *   headers: { Authorization: `Bearer ${accessToken}` }
   * });
   *
   * const data = await response.json();
   * ```
   *
   * @example
   * ```typescript
   * // Using connectionConfig
   * const { accessToken, connectionConfig } = await base44.asServiceRole.connectors.getCurrentAppUserConnection('abc123def');
   *
   * const subdomain = connectionConfig?.subdomain;
   * const response = await fetch(
   *   `https://${subdomain}.example.com/api/v1/resources`,
   *   { headers: { Authorization: `Bearer ${accessToken}` } }
   * );
   *
   * const data = await response.json();
   * ```
   */
  getCurrentAppUserConnection(
    connectorId: string,
  ): Promise<AppUserConnectorConnectionResponse>;

  /**
   * Calls a [metered connector's](#metered-connectors) API through the Base44 proxy.
   *
   * Use this for a shared platform connector identified by an integration type. Base44 adds the OAuth credential to the outgoing request, forwards it, and bills the workspace for the call, so you never handle the token yourself.
   *
   * @param integrationType - The type of integration, such as `'x'`. See [Available connectors](#available-connectors).
   * @param request - The upstream request to forward. See {@link ConnectorApiRequest}.
   * @returns Promise resolving to a {@link ConnectorApiResponse}. Note that an upstream error is reported in `success` and `status`, not thrown — only Base44-side failures reject.
   *
   * @example
   * ```typescript
   * // Post to X
   * const res = await base44.asServiceRole.connectors.callApi('x', {
   *   method: 'POST',
   *   path: '/2/tweets',
   *   body: { text: 'Shipped!' },
   * });
   *
   * if (!res.success) {
   *   console.error('X rejected the post', res.status, res.data);
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Read, with query parameters and a look at what the call cost
   * const res = await base44.asServiceRole.connectors.callApi('x', {
   *   path: '/2/tweets/search/recent',
   *   query: { query: 'base44', max_results: 10 },
   * });
   *
   * console.log(`${res.creditsCharged} credits`, res.data);
   * ```
   */
  callApi<T = unknown>(
    integrationType: ConnectorIntegrationType,
    request: ConnectorApiRequest,
  ): Promise<ConnectorApiResponse<T>>;

  /**
   * Calls a [metered](#metered-connectors), [workspace-registered connector's](#shared-connectors) API through the Base44 proxy.
   *
   * The proxy counterpart to {@linkcode getWorkspaceConnection | getWorkspaceConnection()}: same shared token, identified by connector ID rather than integration type.
   *
   * @param connectorId - The ID of the workspace connector, not the integration type string.
   * @param request - The upstream request to forward. See {@link ConnectorApiRequest}.
   * @returns Promise resolving to a {@link ConnectorApiResponse}.
   *
   * @example
   * ```typescript
   * const res = await base44.asServiceRole.connectors.callWorkspaceApi('abc123def', {
   *   path: '/api/v2/statements',
   * });
   * ```
   */
  callWorkspaceApi<T = unknown>(
    connectorId: string,
    request: ConnectorApiRequest,
  ): Promise<ConnectorApiResponse<T>>;

  /**
   * Calls a [metered](#metered-connectors), [app user connector's](#app-user-connectors) API through the Base44 proxy, as the current app user.
   *
   * The proxy counterpart to {@linkcode getCurrentAppUserConnection | getCurrentAppUserConnection()}. The client must know which app user to act for, so create it with {@linkcode createClientFromRequest | createClientFromRequest()} inside a backend function.
   *
   * @param connectorId - The ID of the app user connector configured in your workspace.
   * @param request - The upstream request to forward. See {@link ConnectorApiRequest}.
   * @returns Promise resolving to a {@link ConnectorApiResponse}.
   *
   * @example
   * ```typescript
   * const res = await base44.asServiceRole.connectors.callCurrentAppUserApi('abc123def', {
   *   method: 'POST',
   *   path: '/2/tweets',
   *   body: { text: 'Posted from my own account' },
   * });
   * ```
   */
  callCurrentAppUserApi<T = unknown>(
    connectorId: string,
    request: ConnectorApiRequest,
  ): Promise<ConnectorApiResponse<T>>;
}

/**
 * User-scoped connectors module for managing app user OAuth connections.
 *
 * This module provides methods for app user OAuth flows: initiating an OAuth connection and disconnecting an app user's connection.
 *
 * Unlike {@link ConnectorsModule | ConnectorsModule} which manages app-scoped tokens,
 * this module manages tokens scoped to individual app users. Methods are keyed on
 * the connector ID, not the integration type.
 *
 * Available via `base44.connectors`.
 */
export interface UserConnectorsModule {
  /**
   * Initiates the OAuth flow for an [app user connector](#app-user-connectors).
   *
   * Returns a redirect URL that the app user should be navigated to in order to
   * authenticate with the external service. The scopes and integration type are
   * derived from the connector configuration in the backend.
   *
   * @param connectorId - The ID of the app user connector configured in your workspace. The AI builder inserts this ID into generated code when it sets up the connector flow. You can also retrieve it from the workspace connectors API.
   * @returns Promise resolving to the redirect URL string.
   *
   * @example
   * ```typescript
   * // Start OAuth for the app user
   * const redirectUrl = await base44.connectors.connectAppUser('abc123def');
   *
   * // Redirect the user to the OAuth provider
   * window.location.href = redirectUrl;
   * ```
   */
  connectAppUser(connectorId: string): Promise<string>;

  /**
   * Disconnects an app user's OAuth connection for an [app user connector](#app-user-connectors).
   *
   * Removes the stored OAuth credentials for the currently authenticated app user's
   * connection to the specified connector.
   *
   * @param connectorId - The ID of the app user connector configured in your workspace. The AI builder inserts this ID into generated code when it sets up the connector flow. You can also retrieve it from the workspace connectors API.
   * @returns Promise resolving when the connection has been removed.
   *
   * @example
   * ```typescript
   * // Disconnect the app user's connection
   * await base44.connectors.disconnectAppUser('abc123def');
   * ```
   */
  disconnectAppUser(connectorId: string): Promise<void>;
}
