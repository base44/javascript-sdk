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
 * All app users share a single OAuth token. Use this for shared accounts. For example, posting to a company Slack channel or reading from a shared Google Calendar. To use a shared connector:
 *
 * 1. Connect the external service account in the app's Integration settings or using the [`connectors push`](/developers/references/cli/commands/connectors-push) CLI command.
 * 2. In a backend function, call {@linkcode getConnection | getConnection()} using the service role client (`base44.asServiceRole.connectors`) with an [integration type](#available-connectors) string to retrieve the shared OAuth token.
 * 3. Use the returned `accessToken` to call the external service's API directly. Some connectors also return a `connectionConfig` with additional values such as a subdomain for building the API URL.
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
 * ## Available connectors
 *
 * All connectors listed below support both shared and app user connections. For shared connectors, pass the integration type string to {@linkcode getConnection | getConnection()}. For app user connectors, register the connector in Workspace Settings and use the connector ID with {@linkcode getCurrentAppUserConnection | getCurrentAppUserConnection()}.
 *
 * | Service | Type identifier |
 * |---|---|
 * | Airtable | `airtable` |
 * | BambooHR | `bamboohr` |
 * | Box | `box` |
 * | Calendly | `calendly` |
 * | ClickUp | `clickup` |
 * | Contentful | `contentful` |
 * | Discord | `discord` |
 * | Dropbox | `dropbox` |
 * | GitHub | `github` |
 * | GitLab | `gitlab` |
 * | Gmail | `gmail` |
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
 * | Salesforce | `salesforce` |
 * | SharePoint | `share_point` |
 * | Slack User | `slack` |
 * | Slack Bot | `slackbot` |
 * | Splitwise | `splitwise` |
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
