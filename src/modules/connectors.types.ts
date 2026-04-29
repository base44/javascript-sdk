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
 * Connection details for an app-user connector.
 */
export interface AppUserConnectorConnectionResponse {
  /** The OAuth access token for the end user's connection. */
  accessToken: string;
  /** Key-value configuration for the connection, or `null` if the connector does not provide one. */
  connectionConfig: Record<string, string> | null;
}

/**
 * Connectors module for managing OAuth tokens for external services.
 *
 * Use this module in **service role** mode (`base44.asServiceRole.connectors`) from server-side code.
 *
 * There are two ways to obtain tokens:
 *
 * - **App-scoped connections** — The app builder connects an integration once; every user of the app shares that OAuth token. Call {@link getConnection} with an [integration type](#available-connectors) string (for example `'googlecalendar'` or `'slack'`).
 * - **End-user (app-user) connections** — Each signed-in end user has their own OAuth token for connectors that support per-user auth. Call {@link getCurrentAppUserConnection} with the **connector ID** (the org connector's database ID), not the integration type. The API returns tokens for the user your request acts on behalf of: when the client is created with both a service token and the end user's JWT (for example via {@link createClientFromRequest | createClientFromRequest()} in a Base44 backend function), requests include the `on-behalf-of` header so the correct user's connection is resolved.
 *
 * End users start or revoke OAuth from the browser using {@link UserConnectorsModule | `base44.connectors`} (`connectAppUser` / `disconnectAppUser`).
 *
 * Unlike the integrations module that provides pre-built functions, connectors give you
 * raw OAuth tokens so you can call external service APIs directly with full control over
 * the API calls you make. This is useful when you need custom API interactions that aren't
 * covered by Base44's pre-built integrations.
 *
 * ## Available connectors
 *
 * For **app-scoped** tokens, pass the integration type string to {@link getConnection}. Use the returned `accessToken` (and `connectionConfig` when the connector provides extra parameters) to call the external service's API directly.
 *
 * | Service | Type identifier |
 * |---|---|
 * | Airtable | `airtable` |
 * | Box | `box` |
 * | ClickUp | `clickup` |
 * | Discord | `discord` |
 * | Dropbox | `dropbox` |
 * | GitHub | `github` |
 * | Gmail | `gmail` |
 * | Google Analytics | `google_analytics` |
 * | Google BigQuery | `googlebigquery` |
 * | Google Calendar | `googlecalendar` |
 * | Google Classroom | `google_classroom` |
 * | Google Docs | `googledocs` |
 * | Google Drive | `googledrive` |
 * | Google Search Console | `google_search_console` |
 * | Google Sheets | `googlesheets` |
 * | Google Slides | `googleslides` |
 * | HubSpot | `hubspot` |
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
 * ## Authentication Modes
 *
 * This module is only available to use with a client in service role authentication mode, which means it can only be used in backend environments.
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
   * Returns the OAuth token string for an external service that an app builder
   * has connected to. This token represents the connected app builder's account
   * and can be used to make authenticated API calls to that external service on behalf of the app.
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
   * const calendarResponse = await fetch(url, {
   *   headers: { 'Authorization': `Bearer ${googleToken}` }
   * });
   *
   * const events = await calendarResponse.json();
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
   * const slackResponse = await fetch(url, {
   *   headers: { 'Authorization': `Bearer ${slackToken}` }
   * });
   *
   * const data = await slackResponse.json();
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
   * Retrieves the OAuth access token and connection configuration for a specific [external integration type](#available-connectors).
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
   * // Get Google Calendar OAuth token and fetch upcoming events
   * const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
   *
   * const timeMin = new Date().toISOString();
   * const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&orderBy=startTime&singleEvents=true&timeMin=${timeMin}`;
   *
   * const calendarResponse = await fetch(url, {
   *   headers: { Authorization: `Bearer ${accessToken}` }
   * });
   *
   * const events = await calendarResponse.json();
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
   * const slackResponse = await fetch(url, {
   *   headers: { Authorization: `Bearer ${accessToken}` }
   * });
   *
   * const data = await slackResponse.json();
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
   * Retrieves an OAuth access token for an end user's connection to a specific connector.
   *
   * @deprecated Use {@link getCurrentAppUserConnection} instead.
   *
   * Returns the OAuth token string that belongs to the currently authenticated end user
   * for the specified connector.
   *
   * @param connectorId - The connector ID (OrgConnector database ID).
   * @returns Promise resolving to the access token string.
   *
   * @example
   * ```typescript
   * // Get the end user's access token for a connector
   * const token = await base44.asServiceRole.connectors.getCurrentAppUserAccessToken('abc123def');
   *
   * const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
   *   headers: { 'Authorization': `Bearer ${token}` }
   * });
   * ```
   */
  getCurrentAppUserAccessToken(connectorId: string): Promise<string>;

  /**
   * Retrieves the OAuth access token and connection configuration for an end user's connection to a specific connector.
   *
   * Use this instead of {@link getCurrentAppUserAccessToken} when you need `connectionConfig` (for example a subdomain or other parameters the integration requires for API URLs).
   *
   * The token belongs to the **end user the request acts on behalf of**. In practice, call from server-side code where the client was created with a service token **and** the end user's JWT so the runtime forwards an `on-behalf-of` header (for example {@link createClientFromRequest | createClientFromRequest()} in a Base44 backend function).
   *
   * @param connectorId - The connector ID (OrgConnector database ID), not the integration type string.
   * @returns Promise resolving to an {@link AppUserConnectorConnectionResponse} with `accessToken` and `connectionConfig`.
   *
   * @example
   * ```typescript
   * // Get the end user's connection details for a connector
   * const { accessToken, connectionConfig } = await base44.asServiceRole.connectors.getCurrentAppUserConnection('abc123def');
   *
   * const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
   *   headers: { Authorization: `Bearer ${accessToken}` }
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Using connectionConfig for APIs that need extra connection parameters
   * const { accessToken, connectionConfig } = await base44.asServiceRole.connectors.getCurrentAppUserConnection('abc123def');
   *
   * const subdomain = connectionConfig?.subdomain;
   * const data = await fetch(
   *   `https://${subdomain}.example.com/api/v1/resources`,
   *   { headers: { Authorization: `Bearer ${accessToken}` } }
   * ).then((r) => r.json());
   * ```
   */
  getCurrentAppUserConnection(connectorId: string): Promise<AppUserConnectorConnectionResponse>;
}

/**
 * User-scoped connectors module for managing app-user OAuth connections.
 *
 * This module provides methods for app-user OAuth flows: initiating an OAuth connection,
 * retrieving the end user's access token, and disconnecting the end user's connection.
 *
 * Unlike {@link ConnectorsModule | ConnectorsModule} which manages app-scoped tokens,
 * this module manages tokens scoped to individual end users. Methods are keyed on
 * the connector ID (the OrgConnector's database ID) rather than the integration type.
 *
 * Available via `base44.connectors`.
 */
export interface UserConnectorsModule {
  /**
   * Initiates the app-user OAuth flow for a specific connector.
   *
   * Returns a redirect URL that the end user should be navigated to in order to
   * authenticate with the external service. The scopes and integration type are
   * derived from the connector configuration server-side.
   *
   * @param connectorId - The connector ID (OrgConnector database ID).
   * @returns Promise resolving to the redirect URL string.
   *
   * @example
   * ```typescript
   * // Start OAuth for the end user
   * const redirectUrl = await base44.connectors.connectAppUser('abc123def');
   *
   * // Redirect the user to the OAuth provider
   * window.location.href = redirectUrl;
   * ```
   */
  connectAppUser(connectorId: string): Promise<string>;

  /**
   * Disconnects an end user's OAuth connection for a specific connector.
   *
   * Removes the stored OAuth credentials for the currently authenticated end user's
   * connection to the specified connector.
   *
   * @param connectorId - The connector ID (OrgConnector database ID).
   * @returns Promise resolving when the connection has been removed.
   *
   * @example
   * ```typescript
   * // Disconnect the end user's connection
   * await base44.connectors.disconnectAppUser('abc123def');
   * ```
   */
  disconnectAppUser(connectorId: string): Promise<void>;
}
